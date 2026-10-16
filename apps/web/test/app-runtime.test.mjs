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
    if (
      ['/api/auth/me', '/api/auth/login', '/api/auth/register'].includes(
        request.url,
      )
    )
      return json(response, user);
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

async function signIn(runtime) {
  await runtime.session.login({ email: user.email, password: 'password123' });
  return runtime.context;
}

test('initial restoration distinguishes unauthorized, server and network errors and can retry', async (t) => {
  for (const failure of ['unauthorized', 'server', 'network']) {
    await t.test(failure, async (t) => {
      const { runtime, routes, sockets } = await fixture(t);
      routes.set('/api/auth/me', (response) => {
        if (failure === 'network') return response.destroy();
        json(
          response,
          { message: 'Unavailable' },
          failure === 'unauthorized' ? 401 : 503,
        );
      });
      assert.equal(runtime.auth.state.status, 'loading');
      assert.equal(runtime.context, null);
      await runtime.start();
      assert.equal(
        runtime.auth.state.status,
        failure === 'unauthorized' ? 'anonymous' : 'error',
      );
      assert.equal(runtime.context, null);
      assert.equal(sockets.length, 0);

      routes.delete('/api/auth/me');
      await runtime.session.restore();
      assert.equal(runtime.auth.state.status, 'authenticated');
      assert.deepEqual(runtime.auth.state.user, user);
      await until(() => sockets.length === 1);
    });
  }
});

test('starting repeatedly and rechecking an authenticated session reuse one context and socket', async (t) => {
  const { runtime, requests, sockets } = await fixture(t);
  const first = runtime.start();
  assert.equal(runtime.start(), first);
  await first;
  const context = runtime.context;
  await runtime.start();
  assert.equal(requests.filter((url) => url === '/api/auth/me').length, 1);
  await runtime.session.restore();
  await runtime.session.revalidate();
  await until(() => sockets.length === 1);
  assert.equal(runtime.context, context);
  assert.equal(runtime.auth.state.status, 'authenticated');
  runtime.dispose();
  runtime.dispose();
  await runtime.start();
  await until(() => !sockets[0].connected);
  assert.equal(runtime.context, null);
  assert.equal(sockets.length, 1);
});

test('login and registration use their response user without an additional session request', async (t) => {
  for (const action of ['login', 'register']) {
    await t.test(action, async (t) => {
      const { runtime, routes, requests, sockets } = await fixture(t);
      const input = {
        email: user.email,
        password: 'password123',
        ...(action === 'register' ? { username: user.username } : {}),
      };
      const returnedUser = { ...user, username: 'ServerUser' };
      let body;
      routes.set(`/api/auth/${action}`, (response, request) => {
        let text = '';
        request.on('data', (chunk) => (text += chunk));
        request.on('end', () => {
          body = JSON.parse(text);
          json(response, returnedUser, action === 'register' ? 201 : 200);
        });
      });
      await runtime.session[action](input);
      assert.deepEqual(body, input);
      assert.deepEqual(runtime.auth.state.user, returnedUser);
      await until(() => sockets.length === 1);
      assert.equal(requests.includes('/api/auth/me'), false);
    });
  }
});

test('login and registration expose failures without creating a private context', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  routes.set('/api/auth/me', (response) =>
    json(response, { message: 'Sign in' }, 401),
  );
  await runtime.start();
  for (const [action, status] of [
    ['login', 401],
    ['register', 409],
  ]) {
    routes.set(`/api/auth/${action}`, (response) =>
      json(
        response,
        {
          code: action === 'login' ? 'UNAUTHORIZED' : 'CONFLICT',
          message: 'Check your credentials',
          fields: { email: ['Already registered'] },
        },
        status,
      ),
    );
    await assert.rejects(
      runtime.session[action]({
        email: user.email,
        username: user.username,
        password: 'password123',
      }),
      (error) => {
        assert.equal(error.status, status);
        assert.deepEqual(error.body.fields, { email: ['Already registered'] });
        return true;
      },
    );
    assert.equal(runtime.auth.state.status, 'anonymous');
    assert.equal(runtime.context, null);
    assert.equal(sockets.length, 0);
  }
});

test('late restoration success and unauthorized responses cannot replace a newer login', async (t) => {
  for (const status of [200, 401]) {
    await t.test(String(status), async (t) => {
      const { runtime, routes } = await fixture(t);
      const started = deferred();
      const ready = deferred();
      routes.set('/api/auth/me', (response) => {
        started.resolve();
        ready.promise.then(() =>
          json(
            response,
            status === 200
              ? { ...user, username: 'PreviousUser' }
              : { message: 'Expired' },
            status,
          ),
        );
      });
      const restoration = runtime.start();
      await started.promise;
      const current = await signIn(runtime);
      ready.resolve();
      await restoration;
      assert.equal(runtime.context, current);
      assert.deepEqual(runtime.auth.state.user, user);
    });
  }
});

test('logout failures preserve the current context; an unauthorized response ends it', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  context.chat.conversationCreated(conversation);
  for (const failure of ['server', 'network']) {
    routes.set('/api/auth/logout', (response) => {
      if (failure === 'network') return response.destroy();
      json(response, { code: 'INTERNAL_ERROR', message: 'Unavailable' }, 503);
    });
    await assert.rejects(runtime.session.logout());
    assert.equal(runtime.context, context);
    assert.equal(runtime.auth.state.status, 'authenticated');
    assert.equal(context.chat.conversations.items.length, 1);
    assert.equal(sockets[0].connected, true);
  }
  routes.set('/api/auth/logout', (response) =>
    json(response, { message: 'Expired' }, 401),
  );
  await runtime.session.logout();
  await until(() => !sockets[0].connected);
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
});

test('late logout errors and unauthorized responses cannot end a newer login', async (t) => {
  for (const status of [401, 503]) {
    await t.test(String(status), async (t) => {
      const { runtime, routes } = await fixture(t);
      await signIn(runtime);
      const started = deferred();
      const ready = deferred();
      routes.set('/api/auth/logout', (response) => {
        started.resolve();
        ready.promise.then(() =>
          json(response, { message: 'Unavailable' }, status),
        );
      });
      const logout = runtime.session.logout();
      await started.promise;
      const current = await signIn(runtime);
      ready.resolve();
      await logout;
      assert.equal(runtime.context, current);
      assert.equal(runtime.auth.state.status, 'authenticated');
    });
  }
});

test('socket connection failure rechecks authorization and keeps login on a network failure', async (t) => {
  for (const failure of ['network', 'unauthorized']) {
    await t.test(failure, async (t) => {
      const { runtime, routes, requests } = await fixture(t, {
        rejectSocket: true,
      });
      routes.set('/api/auth/me', (response) => {
        if (failure === 'network') return response.destroy();
        json(response, { message: 'Expired' }, 401);
      });
      const context = await signIn(runtime);
      await until(() => requests.includes('/api/auth/me'));
      if (failure === 'unauthorized') {
        await until(() => runtime.context === null);
        assert.equal(runtime.auth.state.status, 'anonymous');
      } else {
        await runtime.session.revalidate();
        assert.equal(runtime.context, context);
        assert.equal(runtime.auth.state.status, 'authenticated');
      }
    });
  }
});

test('disposing invalidates a pending login and prevents all later lifecycle requests', async (t) => {
  const { runtime, routes, requests, sockets } = await fixture(t);
  const started = deferred();
  const ready = deferred();
  routes.set('/api/auth/login', (response) => {
    started.resolve();
    ready.promise.then(() => json(response, user));
  });
  const login = signIn(runtime);
  await started.promise;
  runtime.dispose();
  ready.resolve();
  await login;
  const count = requests.length;
  await runtime.start();
  await runtime.session.restore();
  await runtime.session.login({ email: user.email, password: 'password123' });
  await runtime.session.register({ ...user, password: 'password123' });
  await runtime.session.logout();
  await runtime.session.revalidate();
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.equal(sockets.length, 0);
  assert.equal(requests.length, count);
});

test('application roots own independent authorization and chat state', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  await Promise.all([first.runtime.start(), second.runtime.start()]);
  const previous = first.runtime.context;
  const current = second.runtime.context;
  assert.notEqual(previous.api, current.api);
  assert.notEqual(previous.chat.messages, current.chat.messages);
  await first.runtime.session.logout();
  assert.equal(first.runtime.context, null);
  assert.equal(second.runtime.context, current);
  assert.equal(second.runtime.auth.state.status, 'authenticated');
});

test('restoration, socket events and reconnect share chat synchronization', async (t) => {
  const { runtime, sockets, routes } = await fixture(t);
  await runtime.session.restore();
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
  context.chat.applySavedMessage(message);
  assert.equal(context.chat.messages.items.length, 1);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, message.id);
  socket.emit('message:created', { ...message, id: 'invalid' });

  const missed = {
    ...message,
    id: '555555555555555555555555',
    text: 'Saved while disconnected',
    createdAt: '2026-10-15T10:02:00.000Z',
  };
  routes.set(`/api/conversations/${conversation.id}/messages`, (response) =>
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
  const previous = await signIn(runtime);
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
  const logout = runtime.session.logout();
  await logoutStarted.promise;
  routes.delete('/api/conversations');
  const current = await signIn(runtime);
  assert.notEqual(current, previous);
  assert.notEqual(current.api, previous.api);
  assert.notEqual(current.chat.messages, previous.chat.messages);
  assert.notEqual(current.chat.conversations, previous.chat.conversations);

  conversationsResponse.resolve();
  meResponse.resolve();
  logoutResponse.resolve();
  await Promise.all([rejected, logout]);
  previous.chat.applySavedMessage(message);
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

test('current HTTP unauthorized and socket auth end retire the context', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const previous = await signIn(runtime);
  await until(() => sockets.length === 1);
  previous.chat.conversationCreated(conversation);
  sockets[0].emit('auth:ended');
  await until(() => runtime.context === null && !sockets[0].connected);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(previous.chat.conversations.items, []);

  await signIn(runtime);
  routes.set('/api/auth/me', (response) =>
    json(response, { code: 'UNAUTHORIZED', message: 'Expired' }, 401),
  );
  await runtime.session.revalidate();
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
  const context = await signIn(runtime);
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
  const restoration = runtime.session.restore();
  await started.promise;
  runtime.dispose();
  responseReady.resolve();
  await restoration;
  await signIn(runtime);
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.equal(sockets.length, 0);
});

test('logout succeeds when the socket ends authentication before the HTTP response', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(() => sockets.length === 1);
  routes.set('/api/auth/logout', (response) => {
    sockets[0].once('disconnect', () => {
      response.writeHead(204);
      response.end();
    });
    sockets[0].emit('auth:ended');
  });
  await runtime.session.logout();
  assert.equal(runtime.context, null);
  assert.equal(runtime.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
});

test('the client waits for server authorization instead of a local JWT deadline', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  routes.set('/api/auth/login', (response) => {
    response.setHeader('X-Auth-Expires-At', '2000-01-01T00:00:00.000Z');
    json(response, user);
  });
  const context = await signIn(runtime);
  await until(() => sockets.length === 1);
  context.chat.conversationCreated(conversation);
  t.mock.timers.enable({ apis: ['Date'] });
  t.mock.timers.setTime(Date.now() + 86400000);
  assert.equal(runtime.context, context);
  assert.equal(runtime.auth.state.status, 'authenticated');
  t.mock.timers.reset();
  sockets[0].emit('auth:ended');
  await until(() => runtime.context === null && !sockets[0].connected);
  assert.deepEqual(context.chat.conversations.items, []);
});

test('API client serializes query, path and JSON body and preserves auth headers', async () => {
  const { createApi } = await modules.ssrLoadModule('/src/shared/api/index.ts');
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
  assert.equal(response.headers.get('X-Auth-Expires-At'), deadline);
  await api.users.list({ search: 'A & B', cursor: 'next+page=' });
  const body = { text: 'Hello\nWorld' };
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

test('initial and multi-page recovery merge live messages through the REST-loaded boundary', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
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
  routes.set(path, (response) => {
    recoveryStarted.resolve();
    recoveryReady.promise.then(() =>
      json(response, { items: [live], nextCursor: 'new-page' }),
    );
  });
  routes.set(`${path}?cursor=new-page`, (response) =>
    json(response, {
      items: [message, missed],
      nextCursor: 'older-reconciled',
    }),
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
  assert.equal(context.chat.messages.nextCursor, 'older-reconciled');
});

test('logout during recovery discards late pages and never restarts private loads', async (t) => {
  const { runtime, routes, requests } = await fixture(t);
  const context = await signIn(runtime);
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: null }),
  );
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  const started = deferred();
  const ready = deferred();
  routes.set(path, (response) => {
    started.resolve();
    ready.promise.then(() =>
      json(response, { items: [message], nextCursor: 'late-page' }),
    );
  });
  context.chat.refresh();
  await started.promise;
  await runtime.session.logout();
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
  const context = await signIn(runtime);
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

test('recovery reconciles a late commit behind the newest message and refreshes the older boundary', async (t) => {
  const { runtime, routes, requests, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  const path = `/api/conversations/${conversation.id}/messages`;
  const newest = {
    ...message,
    id: '666666666666666666666666',
    text: 'Newer committed first',
  };
  const late = {
    ...message,
    id: '555555555555555555555555',
    text: 'Older insert committed late',
  };
  routes.set(path, (response) =>
    json(response, { items: [message, newest], nextCursor: 'older-original' }),
  );
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, newest.id],
  );
  assert.equal(
    requests.some((url) => url.includes('older-original')),
    false,
  );

  routes.set(path, (response) =>
    json(response, {
      items: [message, late, newest],
      nextCursor: 'older-refreshed',
    }),
  );
  await context.chat.messages.load();
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, late.id, newest.id],
  );
  assert.equal(context.chat.messages.nextCursor, 'older-refreshed');
  assert.equal(
    requests.some((url) => url.includes('older-refreshed')),
    false,
  );

  const older = {
    ...message,
    id: '333333333333333333333333',
    text: 'Older than the loaded window',
  };
  routes.set(`${path}?cursor=older-refreshed`, (response) =>
    json(response, { items: [older], nextCursor: null }),
  );
  await context.chat.messages.load(true);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [older.id, message.id, late.id, newest.id],
  );

  const lateInOlderPage = {
    ...older,
    id: '3aaaaaaaaaaaaaaaaaaaaaaa',
    text: 'Late insert in a loaded older page',
  };
  routes.set(path, (response) =>
    json(response, {
      items: [message, late, newest],
      nextCursor: 'loaded-older-page',
    }),
  );
  routes.set(`${path}?cursor=loaded-older-page`, (response) =>
    json(response, {
      items: [older, lateInOlderPage],
      nextCursor: 'unloaded-history',
    }),
  );
  await context.chat.messages.load();
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [older.id, lateInOlderPage.id, message.id, late.id, newest.id],
  );
  assert.equal(context.chat.messages.nextCursor, 'unloaded-history');
  assert.equal(
    requests.some((url) => url.includes('unloaded-history')),
    false,
  );
});

test('an initially empty history reconciles all 105 missed messages even when an event raced its first response', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  const path = `/api/conversations/${conversation.id}/messages`;
  const missed = Array.from({ length: 105 }, (_, index) => ({
    ...message,
    id: (index + 1).toString(16).padStart(24, '0'),
    text: `Missed ${index + 1}`,
  }));
  const initialStarted = deferred();
  const initialReady = deferred();
  routes.set(path, (response) => {
    initialStarted.resolve();
    initialReady.promise.then(() =>
      json(response, { items: [], nextCursor: null }),
    );
  });
  context.chat.messages.open(conversation.id);
  await initialStarted.promise;
  sockets[0].emit('message:created', missed[104]);
  await until(() => context.chat.messages.items.length === 1);
  initialReady.resolve();
  await until(() => !context.chat.messages.loading);

  routes.set(path, (response) =>
    json(response, { items: missed.slice(55), nextCursor: 'middle' }),
  );
  routes.set(`${path}?cursor=middle`, (response) =>
    json(response, { items: missed.slice(5, 55), nextCursor: 'oldest' }),
  );
  routes.set(`${path}?cursor=oldest`, (response) =>
    json(response, { items: missed.slice(0, 5), nextCursor: null }),
  );
  await context.chat.messages.load();
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    missed.map((item) => item.id),
  );
  assert.equal(context.chat.messages.nextCursor, null);
});

function requestBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(JSON.parse(body)));
  });
}

test('ordinary sends merge HTTP and WS by server ID in either order and preserve newer previews', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  context.chat.conversationCreated(conversation);
  const other = { ...conversation, id: '888888888888888888888888' };
  context.chat.conversationCreated(other);
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
  });
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  const bodies = [];
  const saved = { ...message, senderId: user.id };
  const received = deferred();
  const ready = deferred();
  routes.set(path, async (response, request) => {
    bodies.push(await requestBody(request));
    sockets[0].emit('message:created', saved);
    received.resolve();
    await ready.promise;
    json(response, saved, 201);
  });
  const first = context.chat.sendMessage(conversation.id, '  Hello  ');
  await received.promise;
  await until(() => context.chat.messages.items.length === 1);
  assert.deepEqual(context.chat.messages.items, [saved]);
  ready.resolve();
  await first;
  assert.deepEqual(bodies, [{ text: 'Hello' }]);
  assert.deepEqual(context.chat.messages.items, [saved]);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, saved.id);

  const second = {
    ...saved,
    id: '555555555555555555555555',
    createdAt: '2026-10-15T10:02:00.000Z',
  };
  routes.set(path, async (response, request) => {
    bodies.push(await requestBody(request));
    json(response, second, 201);
  });
  await context.chat.sendMessage(conversation.id, 'Hello');
  sockets[0].emit('message:created', second);
  sockets[0].emit('message:created', saved);
  const otherMessage = {
    ...message,
    conversationId: other.id,
    id: '999999999999999999999999',
    createdAt: '2026-10-15T11:00:00.000Z',
  };
  sockets[0].emit('message:created', otherMessage);
  await until(() => context.chat.conversations.items[0].id === other.id);
  assert.deepEqual(context.chat.messages.items, [saved, second]);
  assert.deepEqual(bodies, [{ text: 'Hello' }, { text: 'Hello' }]);
  assert.equal(context.chat.conversations.items[1].lastMessage.id, second.id);
});

test('a lost send response remains an error even when WS delivers it and a new send can create another message', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  context.chat.conversationCreated(conversation);
  const path = `/api/conversations/${conversation.id}/messages`;
  const bodies = [];
  const first = { ...message, senderId: user.id };
  const second = { ...first, id: '555555555555555555555555' };
  routes.set(path, async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    bodies.push(await requestBody(request));
    sockets[0].emit('message:created', bodies.length === 1 ? first : second);
    if (bodies.length === 1) return response.destroy();
    json(response, second, 201);
  });
  context.chat.messages.open(conversation.id);
  await until(() => !context.chat.messages.loading);
  await assert.rejects(context.chat.sendMessage(conversation.id, 'Hello'));
  await until(() => context.chat.messages.items.length === 1);
  await delay(50);
  assert.equal(bodies.length, 1);
  await context.chat.sendMessage(conversation.id, 'Hello');
  assert.deepEqual(context.chat.messages.items, [first, second]);
  assert.deepEqual(bodies, [{ text: 'Hello' }, { text: 'Hello' }]);
});

test('an unknown conversation event synchronizes through the controller and survives a stale in-flight list', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const started = deferred();
  const ready = deferred();
  routes.set('/api/conversations', async (response) => {
    started.resolve();
    await ready.promise;
    json(response, { items: [conversation], nextCursor: null });
  });
  const context = await signIn(runtime);
  await started.promise;
  await until(() => sockets.length === 1);
  sockets[0].emit('message:created', message);
  // Ordered socket events provide a barrier before releasing the older response.
  const other = { ...conversation, id: '888888888888888888888888' };
  sockets[0].emit('conversation:created', other);
  await until(() =>
    context.chat.conversations.items.some((item) => item.id === other.id),
  );
  ready.resolve();
  await until(
    () => context.chat.conversations.items[0]?.lastMessage?.id === message.id,
  );
  assert.deepEqual(context.chat.messages.items, []);
});

test('a late send updates its own preview after switching history and cannot change a new login', async (t) => {
  const { runtime, routes, sockets } = await fixture(t);
  const context = await signIn(runtime);
  await until(
    () => sockets.length === 1 && !context.chat.conversations.loading,
  );
  context.chat.conversationCreated(conversation);
  const other = { ...conversation, id: '888888888888888888888888' };
  context.chat.conversationCreated(other);
  const started = deferred();
  const ready = deferred();
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    await requestBody(request);
    started.resolve();
    await ready.promise;
    json(response, message, 201);
  });
  context.chat.messages.open(conversation.id);
  const send = context.chat.sendMessage(conversation.id, 'Hello');
  await started.promise;
  context.chat.messages.open(other.id);
  ready.resolve();
  await send;
  assert.deepEqual(context.chat.messages.items, []);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, message.id);

  const lateStarted = deferred();
  const lateReady = deferred();
  routes.set(path, async (response, request) => {
    await requestBody(request);
    lateStarted.resolve();
    await lateReady.promise;
    json(response, message, 201);
  });
  const lateSend = context.chat.sendMessage(conversation.id, 'Hello');
  const rejection = assert.rejects(lateSend, /chat has ended/);
  await lateStarted.promise;
  await runtime.session.logout();
  const current = await signIn(runtime);
  lateReady.resolve();
  await rejection;
  assert.deepEqual(current.chat.messages.items, []);
  assert.deepEqual(current.chat.conversations.items, []);
  assert.deepEqual(context.chat.conversations.items, []);
  await assert.rejects(context.chat.sendMessage(conversation.id, 'Hello'));
});
