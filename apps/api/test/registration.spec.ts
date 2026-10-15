import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { scryptSync } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { setup } from '../src/setup';
import { currentUserSchema, errorSchema } from '@chat/contracts';

describe('Authentication HTTP boundary (real MongoDB)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
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
      .useValue({ now: () => now })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
  });
  afterAll(async () => {
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
    { username: 'юзер' },
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
      password: 'я'.repeat(128),
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

  it('accepts passwords stored in the original scrypt format', async () => {
    const connection = app.get<Connection>(getConnectionToken());
    const salt = '0123456789abcdef0123456789abcdef';
    const key = scryptSync(input.password, salt, 64, {
      N: 32768,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    });
    await connection.collection('users').updateOne(
      { normalizedEmail: 'alice@example.com' },
      {
        $set: {
          passwordHash: `scrypt:32768:8:3:${salt}:${key.toString('hex')}`,
        },
      },
    );
    await login({ email: input.email, password: input.password }).expect(200);
    await login({ email: input.email, password: 'wrong password' }).expect(401);
  });

  it.each([
    { issuer: 'other-api' },
    { audience: 'other-web' },
    { algorithm: 'HS384' as const },
    { sub: 'invalid-id' },
    { sub: '507f1f77bcf86cd799439011' },
    { expiresIn: undefined },
    { notBefore: 60 },
  ])('rejects signed tokens with invalid claims: %j', async (overrides) => {
    const registered = await login({
      email: input.email,
      password: input.password,
    }).expect(200);
    const { sub = registered.body.id, ...options } = overrides;
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
      { sub, iat: Math.floor(now.getTime() / 1000) },
      signingOptions,
    );
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', `chat_token=${token}`)
      .expect(401);
    expect(errorSchema.parse(response.body).code).toBe('UNAUTHORIZED');
  });
});
