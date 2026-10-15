import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import {
  conversationSchema,
  usersPageSchema,
  conversationsPageSchema,
} from '@chat/contracts';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { setup } from '../src/setup';

describe('Users and conversations HTTP / Socket.io boundaries', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    container = await new GenericContainer('mongo:8')
      .withExposedPorts(27017)
      .start();
    const module = await Test.createTestingModule({
      imports: [
        AppModule.configure({
          MONGODB_URI: `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/conversations`,
          JWT_SECRET: 'conversation-test-secret-at-least-thirty-two',
          COOKIE_SECURE: 'false',
          PORT: 3001,
        }),
      ],
    })
      .overrideProvider(Clock)
      .useValue({
        now: () => new Date('2026-10-15T12:00:00Z'),
        scheduleAt: () => () => {},
      })
      .compile();
    app = module.createNestApplication();
    setup(app);
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app?.close();
    await container?.stop();
  });
  async function register(username: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: '12345678',
      })
      .expect(201);
    return {
      id: response.body.id as string,
      cookie: response.headers['set-cookie'][0] as string,
    };
  }
  it('finds other users by case-insensitive substring without exposing emails', async () => {
    const alice = await register('Alice');
    const bob = await register('Bob');
    await register('Bobby');
    const response = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'OB' })
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(usersPageSchema.parse(response.body)).toEqual({
      items: [
        { id: bob.id, username: 'Bob' },
        { id: expect.any(String), username: 'Bobby' },
      ],
      nextCursor: null,
    });
    const all = await request(app.getHttpServer())
      .get('/api/users')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(all.body.items.map((u: { username: string }) => u.username)).toEqual(
      ['Alice', 'Bobby'],
    );
    await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'missing' })
      .set('Cookie', bob.cookie)
      .expect(200, { items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });
  it('paginates 50 users in stable username order and rejects malformed or mismatched cursors', async () => {
    const viewer = await register('Viewer');
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        register(`Page_${String(i).padStart(2, '0')}`),
      ),
    );
    const full = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'page_' })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(full.body.items).toHaveLength(50);
    expect(full.body.nextCursor).toBeNull();
    await register('Page_50');
    const overflow = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'page_' })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(overflow.body.items).toEqual(full.body.items);
    expect(overflow.body.nextCursor).toEqual(expect.any(String));
    const single = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'page_', cursor: overflow.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(
      single.body.items.map((u: { username: string }) => u.username),
    ).toEqual(['Page_50']);
    expect(single.body.nextCursor).toBeNull();
    await register('Page_51');
    const first = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'page_' })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0].username).toBe('Page_00');
    expect(first.body.items[49].username).toBe('Page_49');
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'PAGE_', cursor: first.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(
      second.body.items.map((u: { username: string }) => u.username),
    ).toEqual(['Page_50', 'Page_51']);
    expect(second.body.nextCursor).toBeNull();
    for (const query of [
      { cursor: 'broken' },
      { search: 'other', cursor: first.body.nextCursor },
      { search: ['a', 'b'] },
    ]) {
      await request(app.getHttpServer())
        .get('/api/users')
        .query(query)
        .set('Cookie', viewer.cookie)
        .expect(400);
    }
    await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: '.*' })
      .set('Cookie', viewer.cookie)
      .expect(200, { items: [], nextCursor: null });
  });

  it('creates one empty conversation, reopens it and isolates participant lists', async () => {
    const alice = await register('CreateAlice');
    const bob = await register('CreateBob');
    const outsider = await register('Outsider');
    const create = (cookie: string, userId: string) =>
      request(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', cookie)
        .send({ userId });
    const first = await create(alice.cookie, bob.id).expect(201);
    expect(conversationSchema.parse(first.body)).toEqual({
      id: expect.any(String),
      counterpart: { id: bob.id, username: 'CreateBob' },
      createdAt: expect.any(String),
      lastMessage: null,
    });
    expect((await create(alice.cookie, bob.id).expect(201)).body).toEqual(
      first.body,
    );
    const theirs = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(conversationsPageSchema.parse(theirs.body)).toEqual({
      items: [
        {
          ...first.body,
          counterpart: { id: alice.id, username: 'CreateAlice' },
        },
      ],
      nextCursor: null,
    });
    await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', outsider.cookie)
      .expect(200, { items: [], nextCursor: null });
    await create(alice.cookie, alice.id).expect(400);
    await create(alice.cookie, 'broken').expect(400);
    await create(alice.cookie, '507f1f77bcf86cd799439011').expect(404);
    await request(app.getHttpServer())
      .post('/api/conversations')
      .send({ userId: bob.id })
      .expect(401);
    await request(app.getHttpServer()).get('/api/conversations').expect(401);
    await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: 'broken' })
      .set('Cookie', alice.cookie)
      .expect(400);
  });

  it('concurrent starts share one ID and notify every participant tab but no outsider', async () => {
    const alice = await register('RaceAlice');
    const bob = await register('RaceBob');
    const outsider = await register('RaceOther');
    async function connect(cookie: string) {
      const socket = io(url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { Cookie: cookie },
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('auth:ready', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    }
    const tabs = await Promise.all(
      [alice.cookie, alice.cookie, bob.cookie, bob.cookie, outsider.cookie].map(
        connect,
      ),
    );
    const received: Array<
      Array<{ id: string; counterpart: { username: string } }>
    > = tabs.map(() => []);
    tabs.forEach((tab, i) =>
      tab.on('conversation:created', (data) => received[i].push(data)),
    );
    const notifications = tabs
      .slice(0, 4)
      .map(
        (tab) =>
          new Promise((resolve) => tab.once('conversation:created', resolve)),
      );
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/conversations')
          .set('Cookie', i % 2 ? bob.cookie : alice.cookie)
          .send({ userId: i % 2 ? alice.id : bob.id })
          .expect(201),
      ),
    );
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    await Promise.race([
      Promise.all(notifications),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Missing conversation event')), 1000),
      ),
    ]);
    received
      .flat()
      .forEach((event) =>
        expect(conversationSchema.safeParse(event).success).toBe(true),
      );
    expect(received.map((events) => events.length)).toEqual([1, 1, 1, 1, 0]);
    expect(received[0][0].counterpart.username).toBe('RaceBob');
    expect(received[2][0].counterpart.username).toBe('RaceAlice');
    const list = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(
      list.body.items.map((conversation: { id: string }) => conversation.id),
    ).toEqual([results[0].body.id]);
    tabs.forEach((tab) => tab.disconnect());
  });

  it('paginates conversations with tied creation times by descending ID and binds cursors to the viewer', async () => {
    const viewer = await register('ConversationPager');
    const recipients = await Promise.all(
      Array.from({ length: 52 }, (_, index) =>
        register(`ConversationPage_${String(index).padStart(2, '0')}`),
      ),
    );
    const users = await request(app.getHttpServer())
      .get('/api/users')
      .query({ search: 'ConversationPage_' })
      .set('Cookie', viewer.cookie)
      .expect(200);
    const create = (user: { id: string }) =>
      request(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', viewer.cookie)
        .send({ userId: user.id })
        .expect(201);
    const created = await Promise.all(recipients.slice(0, 50).map(create));
    const full = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(full.body.items).toHaveLength(50);
    expect(full.body.nextCursor).toBeNull();
    created.push(await create(recipients[50]));
    const overflow = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(overflow.body.items).toHaveLength(50);
    expect(overflow.body.nextCursor).toEqual(expect.any(String));
    const single = await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: overflow.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(200);
    const earliestId = created
      .map((result) => result.body.id as string)
      .sort()[0];
    expect(single.body.items.map((item: { id: string }) => item.id)).toEqual([
      earliestId,
    ]);
    expect(single.body.nextCursor).toBeNull();
    created.push(await create(recipients[51]));
    const expected = created
      .map((result) => result.body.id as string)
      .sort()
      .reverse();
    const first = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(
      expected.slice(0, 50),
    );
    expect(
      new Set(
        first.body.items.map((item: { createdAt: string }) => item.createdAt),
      ),
    ).toEqual(new Set(['2026-10-15T12:00:00.000Z']));
    const second = await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: first.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(
      expected.slice(50),
    );
    expect(second.body.nextCursor).toBeNull();
    const outsider = await register('CursorOther');
    await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: first.body.nextCursor })
      .set('Cookie', outsider.cookie)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: users.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(400);
  });
});
