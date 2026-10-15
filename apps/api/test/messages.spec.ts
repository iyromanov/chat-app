import 'reflect-metadata';
import { Test } from '@nestjs/testing';
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
  let url: string;
  const sockets: Socket[] = [];
  let now = new Date('2026-10-15T12:00:00Z');
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
        now: () => now,
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
      .send({ text: '  Hello\nworld  ', attemptId: 'attempt-1' })
      .expect(201);
    expect(messageSchema.parse(sent.body)).toEqual({
      id: expect.any(String),
      conversationId: conversation.body.id,
      senderId: alice.id,
      text: 'Hello\nworld',
      attemptId: 'attempt-1',
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
  it('validates text, protects history and sends, and deduplicates concurrent attempts with conflict detection', async () => {
    const alice = await register('RetryAlice');
    const bob = await register('RetryBob');
    const outsider = await register('RetryOther');
    const conversation = await request(app.getHttpServer())
      .post('/api/conversations')
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id })
      .expect(201);
    const path = `/api/conversations/${conversation.body.id}/messages`;
    const send = (
      text: string,
      cookie = alice.cookie,
      attemptId = 'same-attempt',
    ) =>
      request(app.getHttpServer())
        .post(path)
        .set('Cookie', cookie)
        .send({ text, attemptId });
    for (const text of ['', '   \n ', 'x'.repeat(2001)])
      await send(text).expect(400);
    await send('x'.repeat(2000), alice.cookie, 'maximum').expect(201);
    await request(app.getHttpServer())
      .post(path)
      .set('Cookie', alice.cookie)
      .send({ text: 'Hello' })
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
      .send({ text: 'Hello', attemptId: 'same-attempt' })
      .expect(401);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => send('  Hello  ').expect(201)),
    );
    expect(new Set(attempts.map((result) => result.body.id)).size).toBe(1);
    expect((await send('Hello').expect(201)).body).toEqual(attempts[0].body);
    expect((await send('Changed').expect(409)).body).toEqual({
      code: 'MESSAGE_ATTEMPT_CONFLICT',
      message: 'This attempt was already used for different text',
    });
    await send('Hello', alice.cookie, 'new-attempt').expect(201);
    await send('Hello', bob.cookie).expect(201);
    const history = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', alice.cookie)
      .expect(200);
    expect(history.body.items).toHaveLength(4);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'RetryAlice@example.com', password: '12345678' })
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
      .send({ text: 'Saved before delivery', attemptId: 'socket-attempt' })
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
            .send({ text: `Line ${index}`, attemptId: `history-${index}` })
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
        .send({ text: 'Latest activity', attemptId: 'activity' })
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
    const send = (id: string, text: string, attemptId: string) =>
      request(app.getHttpServer())
        .post(`/api/conversations/${id}/messages`)
        .set('Cookie', viewer.cookie)
        .send({ text, attemptId })
        .expect(201);
    now = new Date('2026-10-15T12:02:00Z');
    await Promise.all(
      conversations.map((conversation) =>
        send(conversation.id, 'Active', 'page-activity'),
      ),
    );
    const sorted = conversations
      .map((conversation) => conversation.id as string)
      .sort()
      .reverse();
    const last = (
      await send(sorted[0], 'Second at the same time', 'page-second')
    ).body;
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
