import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { mongo } from 'mongoose';
import type { INestApplication } from '@nestjs/common';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { messageSchema, messagesPageSchema } from '@chat/contracts/messages';
import { AppModule } from '../src/app.module';
import { Clock } from '../src/common/clock';
import { setup } from '../src/setup';

describe('Messages HTTP / Socket.io boundaries', () => {
  let container: StartedTestContainer;
  let app: INestApplication;
  let database: mongo.MongoClient;
  let url: string;
  let startApp: () => Promise<void>;
  const sockets: Socket[] = [];
  let now = new Date('2026-10-15T12:00:00Z');
  beforeAll(async () => {
    container = await new GenericContainer('mongo:8')
      .withExposedPorts(27017)
      .start();
    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/conversations`;
    database = await new mongo.MongoClient(mongoUri).connect();
    const messages = database.db().collection('messages');
    await messages.createIndex(
      { conversationId: 1, senderId: 1, attemptId: 1 },
      { unique: true },
    );
    await messages.insertOne({
      _id: new mongo.ObjectId('000000000000000000000001'),
      conversationId: '000000000000000000000002',
      senderId: '000000000000000000000003',
      text: 'Legacy message',
      attemptId: 'legacy-attempt',
      createdAt: now,
    });
    startApp = async () => {
      const module = await Test.createTestingModule({
        imports: [
          AppModule.configure({
            MONGODB_URI: mongoUri,
            JWT_SECRET: 'conversation-test-secret-at-least-thirty-two',
            COOKIE_SECURE: 'false',
            PORT: 3001,
          }),
        ],
      })
        .overrideProvider(Clock)
        .useValue({
          now: () => now,
          scheduleAt: () => () => {},
        })
        .compile();
      app = module.createNestApplication();
      setup(app);
      await app.listen(0, '127.0.0.1');
      url = await app.getUrl();
    };
    await startApp();
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app?.close();
    await database?.close();
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
  it('removes the existing attempt index without losing legacy history or its public preview', async () => {
    const messages = database.db().collection('messages');
    const indexes = await messages.indexes();
    expect(indexes.map((index) => index.name)).not.toContain(
      'conversationId_1_senderId_1_attemptId_1',
    );
    expect(indexes.map((index) => index.name)).toContain(
      'conversationId_1_createdAt_-1__id_-1',
    );
    const alice = await register('LegacyAlice');
    const bob = await register('LegacyBob');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    await messages.updateOne(
      { _id: new mongo.ObjectId('000000000000000000000001') },
      { $set: { conversationId: conversation.body.id, senderId: alice.id } },
    );
    const history = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation.body.id}/messages`)
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(history.body.items).toEqual([
      {
        id: '000000000000000000000001',
        conversationId: conversation.body.id,
        senderId: alice.id,
        text: 'Legacy message',
        createdAt: now.toISOString(),
      },
    ]);
    const list = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(list.body.items[0].lastMessage).toEqual(history.body.items[0]);
    expect(await messages.countDocuments({ attemptId: 'legacy-attempt' })).toBe(
      1,
    );
    await app.close();
    await startApp();
    const restored = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation.body.id}/messages`)
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(restored.body).toEqual(history.body);
  });
  it('persists trimmed text and internal line breaks in participant history', async () => {
    const alice = await register('MessageAlice');
    const bob = await register('MessageBob');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    const sent = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .set('Cookie', alice.cookie)
      .send({ text: '  Hello\nworld  ' })
      .expect(201);
    expect(messageSchema.parse(sent.body)).toEqual({
      id: expect.any(String),
      conversationId: conversation.body.id,
      senderId: alice.id,
      text: 'Hello\nworld',
      createdAt: '2026-10-15T12:00:00.000Z',
    });
    const history = await request(app.getHttpServer())
      .get(`/api/conversations/${conversation.body.id}/messages`)
      .set('Cookie', bob.cookie)
      .expect(200);
    expect(messagesPageSchema.parse(history.body)).toEqual({
      items: [sent.body],
      nextCursor: null,
    });
  });
  it('validates text and participant access and saves every ordinary concurrent send', async () => {
    const alice = await register('SendAlice');
    const bob = await register('SendBob');
    const outsider = await register('SendOther');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    const path = `/api/conversations/${conversation.body.id}/messages`;
    const send = (text: string, cookie = alice.cookie) =>
      request(app.getHttpServer())
        .post(path)
        .set('Cookie', cookie)
        .send({ text });
    for (const text of ['', '   \n ', 'x'.repeat(2001)])
      await send(text).expect(400);
    await send('x'.repeat(2000)).expect(201);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', alice.cookie)
      .send({})
      .expect(400);
    await send('Hello', outsider.cookie).expect(404);
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', outsider.cookie)
      .expect(404);
    for (const invalidId of ['broken', '507f1f77bcf86cd799439011']) {
      await request(app.getHttpServer())
        .get(`/api/conversations/${invalidId}/messages`)
        .set('Cookie', alice.cookie)
        .expect(invalidId === 'broken' ? 400 : 404);
    }
    await request(app.getHttpServer()).get(path).expect(401);
    await request(app.getHttpServer())
      .post(path)
      .send({ text: 'Hello' })
      .expect(401);
    const sends = await Promise.all(
      Array.from({ length: 8 }, () => send('  Hello  ').expect(201)),
    );
    expect(new Set(sends.map((result) => result.body.id)).size).toBe(8);
    expect(sends.every((result) => result.body.text === 'Hello')).toBe(true);
    const repeated = await send('Hello').expect(201);
    expect(sends.some((result) => result.body.id === repeated.body.id)).toBe(
      false,
    );
    await send('Changed').expect(201);
    await send('Hello', bob.cookie).expect(201);
    const stored = await database
      .db()
      .collection('messages')
      .find({
        conversationId: conversation.body.id,
      })
      .toArray();
    expect(stored).toHaveLength(12);
    expect(stored.every((row) => !('attemptId' in row))).toBe(true);
    const history = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(history.body.items).toHaveLength(12);
    expect(
      history.body.items.every((row: object) => !('attemptId' in row)),
    ).toBe(true);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'SendAlice@example.com', password: '12345678' })
      .expect(200);
    expect(
      (
        await request(app.getHttpServer())
          .get(path)
          .set('Cookie', login.headers['set-cookie'][0])
          .expect(200)
      ).body,
    ).toEqual(history.body);
  });
  it('delivers the saved HTTP representation to every participant tab and no outsider', async () => {
    const alice = await register('SocketAlice');
    const bob = await register('SocketBob');
    const outsider = await register('SocketOther');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    const tabs = await Promise.all(
      [alice.cookie, alice.cookie, bob.cookie, bob.cookie, outsider.cookie].map(
        async (cookie) => {
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
        },
      ),
    );
    const received: unknown[][] = tabs.map(() => []);
    tabs.forEach((tab, index) =>
      tab.on('message:created', (data) => received[index].push(data)),
    );
    const notifications = tabs
      .slice(0, 4)
      .map(
        (tab) => new Promise((resolve) => tab.once('message:created', resolve)),
      );
    const sent = await request(app.getHttpServer())
      .post(`/api/conversations/${conversation.body.id}/messages`)
      .set('Cookie', alice.cookie)
      .send({ text: 'Saved before delivery' })
      .expect(201);
    await Promise.race([
      Promise.all(notifications),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Missing saved message event')),
          1000,
        ),
      ),
    ]);
    expect(received).toEqual([
      [sent.body],
      [sent.body],
      [sent.body],
      [sent.body],
      [],
    ]);
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/conversations/${conversation.body.id}/messages`)
          .set('Cookie', bob.cookie)
          .expect(200)
      ).body.items,
    ).toEqual([sent.body]);
    tabs.forEach((tab) => tab.disconnect());
  });
  it('pages tied timestamps without gaps and rejects cursors for another history or viewer', async () => {
    const alice = await register('HistoryAlice');
    const bob = await register('HistoryBob');
    const other = await register('HistoryOther');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    const secondConversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: other.id })
      .expect(201);
    const path = `/api/conversations/${conversation.body.id}/messages`;
    const sent = [];
    for (let index = 0; index < 52; index++)
      sent.push(
        (
          await request(app.getHttpServer())
            .post(path)
            .set('Cookie', alice.cookie)
            .send({ text: `Line ${index}` })
            .expect(201)
        ).body,
      );
    const first = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(first.body.items).toEqual(sent.slice(2));
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app.getHttpServer())
      .get(path)
      .query({ cursor: first.body.nextCursor })
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(second.body).toEqual({ items: sent.slice(0, 2), nextCursor: null });
    for (const [target, cookie, cursor] of [
      [path, alice.cookie, 'broken'],
      [path, bob.cookie, first.body.nextCursor],
      [
        `/api/conversations/${secondConversation.body.id}/messages`,
        alice.cookie,
        first.body.nextCursor,
      ],
    ])
      await request(app.getHttpServer())
        .get(target)
        .query({ cursor })
        .set('Cookie', cookie)
        .expect(400);
  });
  it('makes older messages pageable after reconnect and saves a repeated text separately', async () => {
    const alice = await register('RecoveryAlice');
    const bob = await register('RecoveryBob');
    const conversation = (
      await request(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', alice.cookie)
        .send({ userId: bob.id })
        .expect(201)
    ).body;
    const path = `/api/conversations/${conversation.id}/messages`;
    const send = (index: number) =>
      request(app.getHttpServer())
        .post(path)
        .set('Cookie', alice.cookie)
        .send({ text: `Missed ${index}` })
        .expect(201);
    const anchor = (await send(0)).body;
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
      extraHeaders: { Cookie: bob.cookie },
    });
    sockets.push(socket);
    const connect = async () => {
      const ready = new Promise<void>((resolve, reject) => {
        socket.once('auth:ready', () => resolve());
        socket.once('connect_error', reject);
      });
      socket.connect();
      await ready;
    };
    await connect();
    socket.disconnect();
    const missed = [];
    for (let index = 1; index <= 105; index++)
      missed.push((await send(index)).body);
    await connect();
    const first = (
      await request(app.getHttpServer())
        .get(path)
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body;
    expect(first.items).toEqual(missed.slice(55));
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (
      await request(app.getHttpServer())
        .get(path)
        .query({ cursor: first.nextCursor })
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body;
    expect(second.items).toEqual(missed.slice(5, 55));
    expect(second.nextCursor).toEqual(expect.any(String));
    const third = (
      await request(app.getHttpServer())
        .get(path)
        .query({ cursor: second.nextCursor })
        .set('Cookie', bob.cookie)
        .expect(200)
    ).body;
    expect(third).toEqual({
      items: [anchor, ...missed.slice(0, 5)],
      nextCursor: null,
    });
    await request(app.getHttpServer())
      .get(path)
      .query({ cursor: first.nextCursor })
      .set('Cookie', alice.cookie)
      .expect(400);
    const repeated = (await send(105)).body;
    expect(repeated.id).not.toBe(missed[104].id);
    expect(repeated.text).toBe(missed[104].text);
    const notification = new Promise((resolve) =>
      socket.once('message:created', resolve),
    );
    const live = (await send(106)).body;
    expect(await notification).toEqual(live);
    socket.disconnect();
  });
  it('derives latest message activity when listing and reopening conversations', async () => {
    const alice = await register('ActivityAlice');
    const bob = await register('ActivityBob');
    const other = await register('ActivityOther');
    const start = (userId: string) =>
      request(app.getHttpServer())
        .post('/api/conversations')
        .set('Cookie', alice.cookie)
        .send({ userId })
        .expect(201);
    const first = (await start(bob.id)).body;
    const second = (await start(other.id)).body;
    now = new Date('2026-10-15T12:01:00Z');
    const message = (
      await request(app.getHttpServer())
        .post(`/api/conversations/${first.id}/messages`)
        .set('Cookie', bob.cookie)
        .send({ text: 'Latest activity' })
        .expect(201)
    ).body;
    const list = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(list.body.items[0].lastMessage).toEqual(message);
    expect((await start(bob.id)).body.lastMessage).toEqual(message);
  });
  it('paginates computed conversation activity with tied times by conversation ID and picks the latest message ID', async () => {
    const viewer = await register('ActivityPager');
    const recipients = await Promise.all(
      Array.from({ length: 51 }, (_, index) =>
        register(`ActivityPage_${index}`),
      ),
    );
    const conversations = await Promise.all(
      recipients.map(
        async (user) =>
          (
            await request(app.getHttpServer())
              .post('/api/conversations')
              .set('Cookie', viewer.cookie)
              .send({ userId: user.id })
              .expect(201)
          ).body,
      ),
    );
    const send = (id: string, text: string) =>
      request(app.getHttpServer())
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', viewer.cookie)
        .send({ text })
        .expect(201);
    now = new Date('2026-10-15T12:02:00Z');
    await Promise.all(
      conversations.map((conversation) => send(conversation.id, 'Active')),
    );
    const sorted = conversations
      .map((conversation) => conversation.id as string)
      .sort()
      .reverse();
    const last = (await send(sorted[0], 'Second at the same time')).body;
    const first = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual(
      sorted.slice(0, 50),
    );
    expect(first.body.items[0].lastMessage).toEqual(last);
    const second = await request(app.getHttpServer())
      .get('/api/conversations')
      .query({ cursor: first.body.nextCursor })
      .set('Cookie', viewer.cookie)
      .expect(200);
    expect(second.body.items.map((item: { id: string }) => item.id)).toEqual(
      sorted.slice(50),
    );
    expect(second.body.nextCursor).toBeNull();
  });
});
