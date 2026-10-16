import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { setup } from '../src/setup';
import { currentUserSchema } from '@chat/contracts/users';
import { errorSchema } from '@chat/contracts/common';

describe('Authentication HTTP boundary (real MongoDB)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  const timers = new Map<() => void, number>();
  const sockets: Socket[] = [];
  let url: string;

  function advance(milliseconds: number) {
    now = new Date(now.getTime() + milliseconds);
    for (const [callback, at] of timers) {
      if (at <= now.getTime()) {
        timers.delete(callback);
        callback();
      }
    }
  }

  function connect(cookie?: string) {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: cookie ? { Cookie: cookie } : {},
    });
    sockets.push(socket);
    return socket;
  }

  function event(socket: Socket, name: string): Promise<unknown> {
    return new Promise((resolve) => socket.once(name, resolve));
  }

  let now = new Date('2026-10-14T12:00:00Z');

  beforeAll(async () => {
    container = await new GenericContainer('mongo:8')
      .withExposedPorts(27017)
      .start();
    const module = await Test.createTestingModule({
      imports: [
        AppModule.configure({
          MONGODB_URI: `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/test`,
          JWT_SECRET: 'test-secret-at-least-thirty-two-characters',
          COOKIE_SECURE: 'false',
          PORT: 3001,
        }),
      ],
    })
      .overrideProvider(Clock)
      .useValue({
        now: () => now,
        scheduleAt: (at: Date, callback: () => void) => {
          timers.set(callback, at.getTime());
          return () => timers.delete(callback);
        },
      })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app?.close();
    await container?.stop();
  });

  const register = (body: object) =>
    request(app.getHttpServer()).post('/api/auth/register').send(body);
  const input = {
    email: 'Alice@example.com',
    username: 'Alice_1',
    password: 'a simple password',
  };

  it('registers, sets a persistent HttpOnly cookie and restores the user without leaking credentials', async () => {
    const response = await register(input).expect(201);
    expect(currentUserSchema.parse(response.body)).toEqual({
      id: expect.any(String),
      email: 'alice@example.com',
      username: 'Alice_1',
    });
    expect(Object.keys(response.body).sort()).toEqual([
      'email',
      'id',
      'username',
    ]);
    expect(response.headers['x-auth-expires-at']).toBe(
      '2026-10-15T12:00:00.000Z',
    );
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=86400');
    expect(cookie).toContain('SameSite=Lax');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200, response.body);
    now = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it.each([
    { email: '' },
    { email: 'broken' },
    { username: 'ab' },
    { username: 'usér' },
    { username: 'a'.repeat(31) },
    { password: 'short' },
    { password: 'a'.repeat(129) },
  ])('rejects invalid fields %j', async (invalid) => {
    const response = await register({ ...input, ...invalid }).expect(400);
    expect(errorSchema.parse(response.body).code).toBe('VALIDATION_ERROR');
    expect(response.body.fields).toBeDefined();
    expect(response.body.stack).toBeUndefined();
  });

  it.each([
    { email: 'ALICE@EXAMPLE.COM', username: 'OtherUser' },
    { email: 'another@example.com', username: 'aLiCe_1' },
  ])('rejects case-insensitive duplicate %j', async (duplicate) => {
    const response = await register({ ...input, ...duplicate }).expect(409);
    expect(errorSchema.parse(response.body).code).toBe('USER_EXISTS');
  });

  it.each(['email', 'username'])(
    'allows exactly one concurrent registration sharing %s',
    async (field) => {
      const responses = await Promise.all(
        [0, 1].map((index) =>
          register({
            email: `race-${field}-${index}@example.com`,
            username: `race_${field}_${index}`,
            password: '12345678',
            [field]: field === 'email' ? 'race@example.com' : 'Racer',
          }),
        ),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    },
  );

  it('accepts boundary passwords without composition rules', async () => {
    await register({
      email: 'min@example.com',
      username: 'min',
      password: '12345678',
    }).expect(201);
    await register({
      email: 'max@example.com',
      username: 'max',
      password: 'é'.repeat(128),
    }).expect(201);
  });

  it('rejects missing, malformed and forged JWTs', async () => {
    const forged = new JwtService().sign(
      { sub: '507f1f77bcf86cd799439011' },
      {
        secret: 'a-different-signing-secret',
        algorithm: 'HS256',
        issuer: 'chat-api',
        audience: 'chat-web',
        expiresIn: '24h',
      },
    );
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `chat_token=${forged}`)
      .expect(401);
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', 'chat_token=not-a-jwt')
      .expect(401);
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .expect(401);
    expect(errorSchema.parse(response.body).code).toBe('UNAUTHORIZED');
  });

  const login = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send(body as object);

  it('logs in by case-insensitive email and issues a cookie valid for exactly 24 hours', async () => {
    const response = await login({
      email: 'ALICE@EXAMPLE.COM',
      password: input.password,
    }).expect(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'email',
      'id',
      'username',
    ]);
    expect(currentUserSchema.parse(response.body).email).toBe(
      'alice@example.com',
    );
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=86400');
    now = new Date(now.getTime() + 86400 * 1000 - 1000);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200, response.body);
    now = new Date(now.getTime() + 1000);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it.each([
    { email: input.email, password: 'wrong password' },
    { email: 'unknown@example.com', password: input.password },
  ])(
    'rejects incorrect credentials without issuing a cookie: %j',
    async (body) => {
      const response = await login(body).expect(401);
      expect(response.body).toEqual({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    },
  );

  it.each([
    {},
    { email: input.email },
    { email: 'broken', password: input.password },
    { email: { $ne: null }, password: input.password },
    { email: input.email, password: ['12345678'] },
    { email: input.email, password: 'a'.repeat(129) },
  ])('validates credentials before Passport reads them: %j', async (body) => {
    const response = await login(body).expect(400);
    expect(errorSchema.parse(response.body).code).toBe('VALIDATION_ERROR');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('returns the original JWT deadline over HTTP without requiring a socket or renewing on restore', async () => {
    now = new Date('2026-11-01T12:00:00.500Z');
    const response = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    expect(response.headers['x-auth-expires-at']).toBe(
      '2026-11-02T12:00:00.000Z',
    );
    const cookie = response.headers['set-cookie'][0];
    advance(3600 * 1000);
    const restored = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(restored.headers['x-auth-expires-at']).toBe(
      '2026-11-02T12:00:00.000Z',
    );
    expect(restored.headers['set-cookie']).toBeUndefined();
    advance(23 * 3600 * 1000);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('logs out by clearing the cookie while a copied JWT remains valid', async () => {
    const response = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const cookie = response.headers['set-cookie'][0];
    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(logout.headers['set-cookie'][0]).toContain('chat_token=;');
    expect(logout.headers['set-cookie'][0]).toContain('HttpOnly');
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200, response.body);
  });

  it('authenticates Socket.io and disconnects only the current login on logout without revoking the JWT', async () => {
    const first = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const second = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const cookie = first.headers['set-cookie'][0];
    expect(second.headers['set-cookie'][0]).not.toBe(cookie);
    const tabOne = connect(cookie);
    await event(tabOne, 'connect');
    const tabTwo = connect(cookie);
    await event(tabTwo, 'connect');
    const independent = connect(second.headers['set-cookie'][0]);
    await event(independent, 'connect');
    const disconnected = Promise.all([
      event(tabOne, 'disconnect'),
      event(tabTwo, 'disconnect'),
    ]);
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    await disconnected;
    expect(independent.connected).toBe(true);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', second.headers['set-cookie'][0])
      .expect(200);
    const copied = connect(cookie);
    await event(copied, 'connect');
    expect(copied.connected).toBe(true);
  });

  it('rejects missing and forged socket credentials', async () => {
    for (const cookie of [undefined, 'chat_token=forged']) {
      const socket = connect(cookie);
      const failure = await event(socket, 'connect_error');
      expect(failure).toMatchObject({ message: 'Authentication required' });
      expect(socket.connected).toBe(false);
    }
  });

  it('expires existing sockets and rejects HTTP and socket access at the same deadline', async () => {
    const response = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const cookie = response.headers['set-cookie'][0];
    const socket = connect(cookie);
    await event(socket, 'connect');
    advance(86399 * 1000);
    expect(socket.connected).toBe(true);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    const disconnected = event(socket, 'disconnect');
    advance(1000);
    await disconnected;
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .expect(401);
    const expired = connect(cookie);
    expect(await event(expired, 'connect_error')).toMatchObject({
      message: 'Authentication required',
    });
  });

  it.each([
    { issuer: 'other-api' },
    { audience: 'other-web' },
    { algorithm: 'HS384' as const },
    { sub: 'invalid-id' },
    { sub: '507f1f77bcf86cd799439011' },
    { expiresIn: undefined },
    { notBefore: 60 },
    { jti: 'invalid' },
  ])('rejects signed tokens with invalid claims: %j', async (overrides) => {
    const registered = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const {
      sub = registered.body.id,
      jti = randomUUID(),
      ...options
    } = overrides;
    const signingOptions: JwtSignOptions = {
      secret: 'test-secret-at-least-thirty-two-characters',
      algorithm: 'HS256',
      issuer: 'chat-api',
      audience: 'chat-web',
      expiresIn: 86400,
      ...options,
    };
    if (signingOptions.expiresIn === undefined) delete signingOptions.expiresIn;
    const token = new JwtService().sign(
      { sub, jti, iat: Math.floor(now.getTime() / 1000) },
      signingOptions,
    );
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `chat_token=${token}`)
      .expect(401);
    expect(errorSchema.parse(response.body).code).toBe('UNAUTHORIZED');
  });
});
