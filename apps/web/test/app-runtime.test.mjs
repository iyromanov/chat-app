import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'socket.io';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from '../svelte.config.js';

const modules = await createServer({
  configFile: false,
  plugins: [svelte({ configFile: false })],
  resolve: {
    alias: Object.fromEntries(
      Object.entries(svelteConfig.kit.alias).map(([alias, path]) => [
        alias,
        fileURLToPath(new URL(`../${path}`, import.meta.url)),
      ]),
    ),
  },
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
});
after(() => modules.close());
const { createAppRuntime } = await modules.ssrLoadModule(
  '/src/app/runtime/runtime.svelte.ts',
);
const user = {
  id: '111111111111111111111111',
  username: 'Alice',
  email: 'alice@example.com',
};
const conversation = {
  id: '222222222222222222222222',
  counterpart: { id: '333333333333333333333333', username: 'Bob' },
  createdAt: '2026-10-15T10:00:00.000Z',
  lastMessage: null,
};
const message = {
  id: '444444444444444444444444',
  conversationId: conversation.id,
  senderId: conversation.counterpart.id,
  text: 'Hello',
  attemptId: 'first-message',
  createdAt: '2026-10-15T10:01:00.000Z',
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

async function until(predicate) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for client behavior');
    await delay(10);
  }
}

function json(response, data, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(data));
}

async function fixture(t, { rejectSocket = false } = {}) {
  const routes = new Map();
  const requests = [];
  const sockets = [];
  const http = createHttpServer((request, response) => {
    requests.push(request.url);
    const handler = routes.get(request.url);
    if (handler) return handler(response, request);
    if (request.url === '/api/auth/me') {
      response.setHeader(
        'X-Auth-Expires-At',
        new Date(Date.now() + 60000).toISOString(),
      );
      return json(response, user);
    }
    if (request.url === '/api/auth/logout') {
      response.writeHead(204);
      return response.end();
    }
    json(response, { items: [], nextCursor: null });
  });
  const io = new Server(http, { serveClient: false });
  if (rejectSocket) io.use((_socket, next) => next(new Error('Offline')));
  io.on('connection', (socket) => {
    sockets.push(socket);
    socket.emit('auth:ready', {
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
  });
  await new Promise((resolve) => http.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${http.address().port}`;
  const runtime = createAppRuntime({ baseUrl });
  t.after(async () => {
    runtime.dispose();
    await new Promise((resolve) => {
      io.close(resolve);
      http.closeAllConnections();
    });
  });
  return { runtime, routes, requests, sockets };
}

function signIn(runtime) {
  runtime.auth.signedIn(user, Date.now() + 60000);
  return runtime.context;
}

test('restoration, socket events and reconnect share chat synchronization', async (t) => {
  const { runtime, sockets, routes } = await fixture(t);
  await runtime.auth.restore();
  assert.equal(runtime.auth.state.status, 'authenticated');
  const context = runtime.context;
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  const socket = sockets[0];
  socket.emit('conversation:created', conversation);
  await until(() => context.chat.conversations.items.length === 1);
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  socket.emit('message:created', message);
  await until(() => context.chat.messages.items.length === 1);
  context.chat.messageSaved(message);
  assert.equal(context.chat.messages.items.length, 1);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, message.id);
  socket.emit('message:created', { ...message, id: 'invalid' });

  const missed = {
    ...message,
    id: '555555555555555555555555',
    text: 'Saved while disconnected',
    createdAt: '2026-10-15T10:02:00.000Z',
  };
  routes.set(
    `/api/conversations/${conversation.id}/messages?after=start`,
    (response) =>
      json(response, { items: [message, missed], nextCursor: null }),
  );
  socket.conn.close();
  await until(
    () => sockets.length === 2 && context.chat.messages.items.length === 2,
  );
  assert.equal(runtime.context, context);
  assert.equal(context.chat.conversations.items.length, 1);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, missed.id],
  );
});

test('a new login isolates late HTTP failures, logout responses and store loads', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const conversationsStarted = deferred();
  const conversationsResponse = deferred();
  routes.set('/api/conversations', (response) => {
    conversationsStarted.resolve();
    conversationsResponse.promise.then(() =>
      json(response, { items: [conversation], nextCursor: null }),
    );
  });
  const previous = signIn(runtime);
  await conversationsStarted.promise;
  await until(() => sockets.length === 1);

  const meStarted = deferred();
  const meResponse = deferred();
  routes.set('/api/auth/me', (response) => {
    meStarted.resolve();
    meResponse.promise.then(() =>
      json(response, { code: 'UNAUTHORIZED', message: 'Expired' }, 401),
    );
  });
  const rejected = assert.rejects(previous.api.auth.me());
  await meStarted.promise;

  const logoutStarted = deferred();
  const logoutResponse = deferred();
  routes.set('/api/auth/logout', (response) => {
    logoutStarted.resolve();
    logoutResponse.promise.then(() => {
      response.writeHead(204);
      response.end();
    });
  });
  const logout = runtime.auth.logout();
  await logoutStarted.promise;
  routes.delete('/api/conversations');
  const current = signIn(runtime);
  assert.notEqual(current, previous);
  assert.notEqual(current.api, previous.api);
  assert.notEqual(current.chat.messages, previous.chat.messages);
  assert.notEqual(current.chat.conversations, previous.chat.conversations);

  conversationsResponse.resolve();
  meResponse.resolve();
  logoutResponse.resolve();
  await Promise.all([rejected, logout]);
  previous.chat.messageSaved(message);
  previous.chat.conversationCreated(conversation);
  await until(
    () =>
      sockets.length === 2 &&
      !sockets[0].connected &&
      !current.chat.conversations.loading,
  );
  assert.equal(sockets[0].connected, false);
  assert.equal(runtime.auth.state.status, 'authenticated');
  assert.equal(runtime.context, current);
  assert.deepEqual(previous.chat.conversations.items, []);
  assert.deepEqual(current.chat.conversations.items, []);
});

test('current HTTP unauthorized, socket auth end and cross-tab logout retire the context', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const previous = signIn(runtime);
  await until(() => sockets.length === 1);
  previous.chat.conversationCreated(conversation);
  sockets[0].emit('auth:ended');
  await until(() => runtime.context === null && !sockets[0].connected);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(previous.chat.conversations.items, []);

  const next = signIn(runtime);
  runtime.auth.storageChanged({ key: 'unrelated' });
  assert.equal(runtime.context, next);
  runtime.auth.storageChanged({ key: 'chat:logout' });
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');

  signIn(runtime);
  routes.set('/api/auth/me', (response) =>
    json(response, { code: 'UNAUTHORIZED', message: 'Expired' }, 401),
  );
  await runtime.auth.revalidate();
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
});

test('REST recovery and visibility refresh work when Socket.io is unavailable', async (t) => {
  const { runtime, routes, requests } = await fixture(t, {
    rejectSocket: true,
  });
  routes.set('/api/conversations', (response) =>
    json(response, { items: [conversation], nextCursor: null }),
  );
  const context = signIn(runtime);
  await until(
    () =>
      context.chat.conversations.items.length === 1 &&
      requests.includes('/api/auth/me'),
  );
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  t.after(() => {
    if (originalDocument)
      Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { visibilityState: 'visible' },
  });
  const count = requests.filter((url) => url === '/api/conversations').length;
  routes.set('/api/auth/me', (response) =>
    json(response, { code: 'NETWORK_ERROR', message: 'Unavailable' }, 503),
  );
  runtime.visibilityChanged();
  await until(
    () => requests.filter((url) => url === '/api/conversations').length > count,
  );
  assert.equal(runtime.context, context);
  assert.equal(runtime.auth.state.status, 'authenticated');
});

test('disposing during restoration prevents a late response from creating a context', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const started = deferred();
  const responseReady = deferred();
  routes.set('/api/auth/me', (response) => {
    started.resolve();
    responseReady.promise.then(() => {
      response.setHeader(
        'X-Auth-Expires-At',
        new Date(Date.now() + 60000).toISOString(),
      );
      json(response, user);
    });
  });
  const restoration = runtime.auth.restore();
  await started.promise;
  runtime.dispose();
  responseReady.resolve();
  await restoration;
  runtime.auth.signedIn(user, Date.now() + 60000);
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.equal(sockets.length, 0);
});

test('logout broadcasts to other tabs even when the socket ends authentication first', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  const markers = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem: (key, value) => markers.push({ key, value }) },
  });
  t.after(() => {
    if (originalStorage)
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });
  const context = signIn(runtime);
  await until(() => sockets.length === 1);
  routes.set('/api/auth/logout', (response) => {
    sockets[0].once('disconnect', () => {
      response.writeHead(204);
      response.end();
    });
    sockets[0].emit('auth:ended');
  });
  await runtime.auth.logout();
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].key, 'chat:logout');
  assert.match(markers[0].value, /^[a-f0-9]{32}$/);
});

test('authentication expiry closes the connection and clears user data', async (t) => {
  const { runtime } = await fixture(t);
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  runtime.auth.signedIn(user, Date.now() + 60000);
  const context = runtime.context;
  context.chat.conversationCreated(conversation);
  t.mock.timers.tick(60000);
  t.mock.timers.reset();
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
});

test('API client serializes query, path and JSON body and preserves auth headers', async () => {
  const { createApi, readAuthDeadline } = await modules.ssrLoadModule(
    '/src/shared/api/index.ts',
  );
  const requests = [];
  const deadline = '2026-10-15T12:00:00.000Z';
  const api = createApi({
    baseUrl: 'https://chat.example',
    onUnauthorized: () => assert.fail('Unexpected unauthorized response'),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return globalThis.Response.json(user, {
        headers: { 'X-Auth-Expires-At': deadline },
      });
    },
  });
  const credentials = { email: 'alice@example.com', password: 'password123' };
  const response = await api.auth.login(credentials);
  assert.deepEqual(response.data, user);
  assert.equal(readAuthDeadline(response), Date.parse(deadline));
  await api.users.list({ search: 'A & B', cursor: 'next+page=' });
  const body = { text: 'Hello\nWorld', attemptId: 'send-once' };
  await api.messages.send(conversation.id, body);
  await api.messages.list(conversation.id, { cursor: undefined });
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      'https://chat.example/api/auth/login',
      'https://chat.example/api/users?search=A%20%26%20B&cursor=next%2Bpage%3D',
      `https://chat.example/api/conversations/${conversation.id}/messages`,
      `https://chat.example/api/conversations/${conversation.id}/messages`,
    ],
  );
  assert.ok(requests.every(({ options }) => options.credentials === 'include'));
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requests[0].options.body), credentials);
  assert.deepEqual(JSON.parse(requests[2].options.body), body);
  assert.equal(requests[3].options.method, 'GET');
});

test('API client handles empty logout responses and normalizes HTTP errors', async () => {
  const { createApi, ApiError } = await modules.ssrLoadModule(
    '/src/shared/api/index.ts',
  );
  let unauthorized = 0;
  let response = new globalThis.Response(null, { status: 204 });
  const api = createApi({
    onUnauthorized: () => unauthorized++,
    fetch: async () => response,
  });
  assert.equal((await api.auth.logout()).status, 204);
  const body = {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input',
    fields: { email: ['Invalid email'] },
  };
  response = globalThis.Response.json(body, { status: 400 });
  await assert.rejects(api.auth.login({ email: '', password: '' }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.deepEqual(error.body, body);
    return true;
  });
  assert.equal(unauthorized, 0);
  response = globalThis.Response.json(
    { code: 'UNAUTHORIZED', message: 'Expired' },
    { status: 401 },
  );
  await assert.rejects(api.auth.me(), ApiError);
  assert.equal(unauthorized, 1);
  response = new globalThis.Response('Unavailable', { status: 503 });
  await assert.rejects(api.auth.me(), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.body.code, 'NETWORK_ERROR');
    return true;
  });
  assert.equal(unauthorized, 1);
});

test('initial and multi-page recovery merge live messages without advancing past missed pages', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = signIn(runtime);
  await until(() => sockets.length === 1);
  const socket = sockets[0];
  const path = `/api/conversations/${conversation.id}/messages`;
  const initialStarted = deferred();
  const initialReady = deferred();
  routes.set(path, (response) => {
    initialStarted.resolve();
    initialReady.promise.then(() =>
      json(response, { items: [message], nextCursor: 'older-history' }),
    );
  });
  context.chat.messages.open(conversation.id);
  await initialStarted.promise;
  const live = {
    ...message,
    id: '666666666666666666666666',
    text: 'Live during load',
    createdAt: '2026-10-15T10:04:00.000Z',
  };
  socket.emit('message:created', live);
  await until(() => context.chat.messages.items.length === 1);
  initialReady.resolve();
  await until(() => !context.chat.messages.loading);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, live.id],
  );
  const missed = {
    ...message,
    id: '555555555555555555555555',
    text: 'Missed before event',
    createdAt: '2026-10-15T10:02:00.000Z',
  };
  const recoveryStarted = deferred();
  const recoveryReady = deferred();
  routes.set(`${path}?after=${message.id}`, (response) => {
    recoveryStarted.resolve();
    recoveryReady.promise.then(() =>
      json(response, { items: [missed], nextCursor: 'new-page' }),
    );
  });
  routes.set(`${path}?cursor=new-page&after=${message.id}`, (response) =>
    json(response, { items: [live], nextCursor: null }),
  );
  context.chat.refresh();
  await recoveryStarted.promise;
  const boundary = {
    ...live,
    id: '777777777777777777777777',
    text: 'Live during recovery',
    createdAt: '2026-10-15T10:05:00.000Z',
  };
  socket.emit('message:created', boundary);
  await until(() => context.chat.messages.items.length === 3);
  recoveryReady.resolve();
  await until(() => !context.chat.messages.loading);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, missed.id, live.id, boundary.id],
  );
  assert.equal(context.chat.messages.nextCursor, 'older-history');
});

test('uncertain send retries its original payload while edited text remains a separate draft', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = signIn(runtime);
  await until(() => sockets.length === 1);
  const path = `/api/conversations/${conversation.id}/messages`;
  const bodies = [];
  let serverError = false;
  routes.set(path, (response, request) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const input = JSON.parse(body);
      bodies.push(input);
      if (bodies.length === 1) return response.destroy();
      if (serverError)
        return json(
          response,
          { code: 'INTERNAL_ERROR', message: 'Unavailable' },
          503,
        );
      json(response, { ...message, senderId: user.id, ...input }, 201);
    });
  });
  const composer = context.chat.composer;
  composer.open(conversation.id);
  const draft = composer.drafts[conversation.id];
  draft.text = 'Original message';
  await composer.send(conversation.id);
  assert.equal(draft.status, 'uncertain');
  draft.text = 'Edited draft';
  await composer.send(conversation.id);
  assert.equal(bodies.length, 1);
  await composer.retry(conversation.id);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(draft.status, 'confirmed');
  assert.equal(draft.text, 'Edited draft');
  serverError = true;
  await composer.send(conversation.id);
  assert.equal(draft.status, 'uncertain');
  assert.notEqual(bodies[2].attemptId, bodies[0].attemptId);
  sockets[0].emit('message:created', {
    ...message,
    senderId: user.id,
    ...bodies[2],
  });
  await until(() => draft.status === 'confirmed');
  assert.equal(draft.text, '');
});

test('logout during recovery discards late pages and never restarts private loads', async (t) => {
  const { runtime, routes, requests } = await fixture(t);
  const context = signIn(runtime);
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: null }),
  );
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  const started = deferred();
  const ready = deferred();
  routes.set(`${path}?after=${message.id}`, (response) => {
    started.resolve();
    ready.promise.then(() =>
      json(response, { items: [message], nextCursor: 'late-page' }),
    );
  });
  context.chat.refresh();
  await started.promise;
  runtime.auth.storageChanged({ key: 'chat:logout' });
  ready.resolve();
  await delay(50);
  assert.equal(runtime.context, null);
  assert.deepEqual(context.chat.messages.items, []);
  assert.deepEqual(context.chat.conversations.items, []);
  assert.equal(
    requests.some((url) => url.includes('late-page')),
    false,
  );
});

test('conversation refresh updates loaded pages and keeps newer live activity over stale REST', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const older = {
    ...conversation,
    id: '111111111111111111111111',
    createdAt: '2026-10-15T09:00:00.000Z',
  };
  routes.set('/api/conversations', (response) =>
    json(response, {
      items: [conversation],
      nextCursor: 'older-conversations',
    }),
  );
  routes.set('/api/conversations?cursor=older-conversations', (response) =>
    json(response, { items: [older], nextCursor: null }),
  );
  const context = signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  await context.chat.conversations.load(true);
  const started = deferred();
  const ready = deferred();
  const activity = {
    ...message,
    conversationId: older.id,
    createdAt: '2026-10-15T11:00:00.000Z',
  };
  routes.set('/api/conversations', (response) => {
    started.resolve();
    ready.promise.then(() =>
      json(response, {
        items: [{ ...older, lastMessage: activity }],
        nextCursor: 'refresh-rest',
      }),
    );
  });
  routes.set('/api/conversations?cursor=refresh-rest', (response) =>
    json(response, { items: [conversation], nextCursor: null }),
  );
  context.chat.refresh();
  await started.promise;
  const newer = {
    ...activity,
    id: '555555555555555555555555',
    createdAt: '2026-10-15T12:00:00.000Z',
  };
  sockets[0].emit('message:created', newer);
  await until(
    () => context.chat.conversations.items[0].lastMessage?.id === newer.id,
  );
  ready.resolve();
  await until(() => !context.chat.conversations.loading);
  assert.deepEqual(
    context.chat.conversations.items.map((item) => item.id),
    [older.id, conversation.id],
  );
  assert.equal(context.chat.conversations.items[0].lastMessage.id, newer.id);
  assert.equal(context.chat.conversations.nextCursor, null);
});
