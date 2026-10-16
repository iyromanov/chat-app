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
const { createApplication } = await modules.ssrLoadModule(
  '/src/app/application.svelte.ts',
);
const { createUserSearch } = await modules.ssrLoadModule(
  '/src/features/find-users/user-search.svelte.ts',
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
  const app = createApplication({ baseUrl });
  t.after(async () => {
    app.dispose();
    await new Promise((resolve) => {
      io.close(resolve);
      http.closeAllConnections();
    });
  });
  return { app, routes, requests, sockets };
}

async function signIn(app) {
  await app.session.login({ email: user.email, password: 'password123' });
  return app.context;
}

test('local user search browses, paginates, retries failures and distinguishes empty results', async (t) => {
  const { app, routes } = await fixture(t);
  const context = await signIn(app);
  const users = createUserSearch(context.chat.searchUsers);
  t.after(users.dispose);
  const bob = conversation.counterpart;
  const carol = { id: '555555555555555555555555', username: 'Carol' };
  routes.set('/api/users?search=', (response) =>
    json(response, { items: [bob], nextCursor: 'next-users' }),
  );
  const first = users.load();
  assert.equal(users.pagination.loading, true);
  await first;
  assert.deepEqual(users.items, [bob]);
  assert.equal(users.pagination.nextCursor, 'next-users');
  routes.set('/api/users?search=&cursor=next-users', (response) =>
    json(response, { message: 'Unavailable' }, 503),
  );
  await users.load(true);
  assert.equal(
    users.pagination.error,
    'Unable to find users. Please try again',
  );
  assert.equal(users.pagination.loading, false);
  assert.deepEqual(users.items, [bob]);
  assert.equal(users.pagination.nextCursor, 'next-users');
  assert.equal(users.pagination.failedMode, 'next');
  routes.set('/api/users?search=&cursor=next-users', (response) =>
    json(response, { items: [bob, carol], nextCursor: null }),
  );
  await users.load(true);
  assert.equal(users.pagination.error, '');
  assert.deepEqual(users.items, [bob, carol]);
  assert.equal(users.pagination.nextCursor, null);
  routes.set('/api/users?search=nobody', (response) =>
    json(response, { items: [], nextCursor: null }),
  );
  users.change('nobody');
  assert.deepEqual(users.items, []);
  await until(() => !users.pagination.loading);
  assert.equal(users.pagination.error, '');
  assert.deepEqual(users.items, []);
});

test('cursor lists block concurrent load-more requests and stop at the last page', async (t) => {
  for (const kind of ['users', 'messages', 'conversations']) {
    await t.test(kind, async (t) => {
      const { app, routes, requests, sockets } = await fixture(t);
      const paths = {
        users: '/api/users?search=',
        messages: `/api/conversations/${conversation.id}/messages`,
        conversations: '/api/conversations',
      };
      const items = {
        users: conversation.counterpart,
        messages: message,
        conversations: conversation,
      };
      const path = paths[kind];
      const item = items[kind];
      routes.set(path, (response) =>
        json(response, { items: [item], nextCursor: 'next-page' }),
      );
      const context = await signIn(app);
      await until(
        () =>
          sockets.length === 1 &&
          context.connectionState === 'Connected' &&
          !context.chat.conversations.pagination.loading,
      );
      const users = createUserSearch(context.chat.searchUsers);
      t.after(users.dispose);
      if (kind === 'users') await users.load();
      if (kind === 'messages')
        await context.chat.openConversation(conversation.id);
      const lists = {
        users: { state: users, load: (more) => users.load(more) },
        messages: {
          state: context.chat.messages,
          load: context.chat.loadMessages,
        },
        conversations: {
          state: context.chat.conversations,
          load: context.chat.loadConversations,
        },
      };
      const { state, load } = lists[kind];
      const nextPath = `${path}${kind === 'users' ? '&' : '?'}cursor=next-page`;
      const started = deferred();
      const ready = deferred();
      t.after(() => ready.resolve());
      routes.set(nextPath, async (response) => {
        started.resolve();
        await ready.promise;
        json(response, { items: [item], nextCursor: null });
      });
      const next = load(true);
      await started.promise;
      await Promise.all([load(true), load(true)]);
      assert.equal(state.pagination.loading, true);
      ready.resolve();
      await next;
      assert.equal(requests.filter((url) => url === nextPath).length, 1);
      assert.deepEqual(state.items, [item]);
      assert.equal(state.pagination.nextCursor, null);
      const count = requests.length;
      await load(true);
      assert.equal(requests.length, count);
      assert.equal(state.pagination.loading, false);
    });
  }
});

test('a changed search ignores old first pages, pagination and failures', async (t) => {
  for (const mode of ['first page', 'pagination', 'failure']) {
    await t.test(mode, async (t) => {
      const { app, routes } = await fixture(t);
      const context = await signIn(app);
      const users = createUserSearch(context.chat.searchUsers);
      t.after(users.dispose);
      const started = deferred();
      const ready = deferred();
      routes.set('/api/users?search=', (response) =>
        json(response, {
          items: [conversation.counterpart],
          nextCursor: 'old-users',
        }),
      );
      if (mode === 'pagination') await users.load();
      const oldPath =
        mode === 'pagination'
          ? '/api/users?search=&cursor=old-users'
          : '/api/users?search=';
      routes.set(oldPath, async (response) => {
        started.resolve();
        await ready.promise;
        json(
          response,
          mode === 'failure'
            ? { message: 'Unavailable' }
            : { items: [conversation.counterpart], nextCursor: 'stale-cursor' },
          mode === 'failure' ? 503 : 200,
        );
      });
      const old = users.load(mode === 'pagination');
      await started.promise;
      const carol = { id: '555555555555555555555555', username: 'Carol' };
      routes.set('/api/users?search=cA', (response) =>
        json(response, { items: [carol], nextCursor: null }),
      );
      users.change('cA');
      assert.deepEqual(users.items, []);
      assert.equal(users.pagination.nextCursor, null);
      await until(() => !users.pagination.loading);
      ready.resolve();
      await old;
      assert.equal(users.search, 'cA');
      assert.deepEqual(users.items, [carol]);
      assert.equal(users.pagination.nextCursor, null);
      assert.equal(users.pagination.error, '');
      assert.equal(users.pagination.loading, false);
    });
  }
});

test('search failures can retry the first page and disposed UI ignores pending results', async (t) => {
  const { app, routes } = await fixture(t);
  const context = await signIn(app);
  const users = createUserSearch(context.chat.searchUsers);
  routes.set('/api/users?search=', (response) => response.destroy());
  await users.load();
  assert.equal(users.pagination.loading, false);
  assert.equal(
    users.pagination.error,
    'Unable to find users. Please try again',
  );
  const started = deferred();
  const ready = deferred();
  routes.set('/api/users?search=', async (response) => {
    started.resolve();
    await ready.promise;
    json(response, { items: [conversation.counterpart], nextCursor: null });
  });
  const retry = users.load();
  assert.equal(users.pagination.error, '');
  await started.promise;
  users.dispose();
  ready.resolve();
  await retry;
  assert.deepEqual(users.items, []);
});

test('search results and unauthorized responses from a previous login cannot enter a new UI', async (t) => {
  for (const status of [200, 401]) {
    await t.test(String(status), async (t) => {
      const { app, routes } = await fixture(t);
      const previous = await signIn(app);
      const started = deferred();
      const ready = deferred();
      routes.set('/api/users?search=old', async (response) => {
        started.resolve();
        await ready.promise;
        json(
          response,
          status === 200
            ? { items: [conversation.counterpart], nextCursor: null }
            : { message: 'Expired' },
          status,
        );
      });
      const old = previous.chat.searchUsers('old');
      const rejected = assert.rejects(old);
      await started.promise;
      await app.session.logout();
      const current = await signIn(app);
      const users = createUserSearch(current.chat.searchUsers);
      t.after(users.dispose);
      await users.load();
      ready.resolve();
      await rejected;
      assert.equal(app.context, current);
      assert.equal(app.auth.state.status, 'authenticated');
      assert.deepEqual(users.items, []);
      assert.equal(users.pagination.error, '');
      await assert.rejects(previous.chat.searchUsers(''), /chat has ended/);
    });
  }
});

test('starting and reopening a conversation updates its list and opens saved history through one action', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 && !context.chat.conversations.pagination.loading,
  );
  const bodies = [];
  routes.set('/api/conversations', async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    bodies.push(await requestBody(request));
    json(response, conversation, 201);
  });
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: null }),
  );
  assert.deepEqual(
    await context.chat.startConversation(conversation.counterpart.id),
    conversation,
  );
  assert.deepEqual(context.chat.conversations.items, [conversation]);
  assert.equal(context.chat.messages.conversationId, conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
  assert.deepEqual(context.chat.messages.items, [message]);
  await context.chat.startConversation(conversation.counterpart.id);
  assert.deepEqual(context.chat.conversations.items, [conversation]);
  assert.deepEqual(bodies, [
    { userId: conversation.counterpart.id },
    { userId: conversation.counterpart.id },
  ]);
  assert.deepEqual(context.chat.messages.items, [message]);
});

test('a completed start opens its conversation and a failed start preserves the current selection', async (t) => {
  for (const phase of ['creation', 'history', 'another start', 'failure']) {
    await t.test(phase, async (t) => {
      const { app, routes, sockets } = await fixture(t);
      const context = await signIn(app);
      await until(
        () =>
          sockets.length === 1 &&
          !context.chat.conversations.pagination.loading,
      );
      const other = {
        ...conversation,
        id: '888888888888888888888888',
        counterpart: { id: '999999999999999999999999', username: 'Carol' },
      };
      const otherMessage = { ...message, conversationId: other.id };
      const started = deferred();
      const ready = deferred();
      routes.set('/api/conversations', async (response, request) => {
        if (request.method === 'GET')
          return json(response, { items: [], nextCursor: null });
        const input = await requestBody(request);
        if (input.userId === other.counterpart.id)
          return json(response, other, 201);
        if (phase !== 'history') {
          started.resolve();
          await ready.promise;
        }
        json(
          response,
          phase === 'failure' ? { message: 'Unavailable' } : conversation,
          phase === 'failure' ? 503 : 201,
        );
      });
      routes.set(
        `/api/conversations/${conversation.id}/messages`,
        async (response) => {
          if (phase === 'history') {
            started.resolve();
            await ready.promise;
          }
          json(response, { items: [message], nextCursor: null });
        },
      );
      routes.set(`/api/conversations/${other.id}/messages`, (response) =>
        json(response, { items: [otherMessage], nextCursor: null }),
      );
      const old = context.chat.startConversation(conversation.counterpart.id);
      const result =
        phase === 'failure' ? assert.rejects(old, /Service unavailable/) : old;
      await started.promise;
      if (phase === 'another start')
        assert.deepEqual(
          await context.chat.startConversation(other.counterpart.id),
          other,
        );
      else await context.chat.openConversation(other.id);
      ready.resolve();
      if (phase === 'failure') await result;
      else assert.deepEqual(await result, conversation);
      const selected =
        phase === 'history' || phase === 'failure' ? other : conversation;
      assert.equal(context.chat.messages.conversationId, selected.id);
      await until(() => !context.chat.messages.pagination.loading);
      assert.deepEqual(context.chat.messages.items, [
        selected === other ? otherMessage : message,
      ]);
    });
  }
});

test('failed starts preserve the selected history and late starts cannot enter a new login', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const previous = await signIn(app);
  await until(
    () =>
      sockets.length === 1 && !previous.chat.conversations.pagination.loading,
  );
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: null }),
  );
  await previous.chat.openConversation(conversation.id);
  routes.set('/api/conversations', (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    json(response, { code: 'NOT_FOUND', message: 'User not found' }, 404);
  });
  await assert.rejects(
    previous.chat.startConversation('missing'),
    /User not found/,
  );
  assert.equal(previous.chat.messages.conversationId, conversation.id);
  assert.deepEqual(previous.chat.messages.items, [message]);

  const started = deferred();
  const ready = deferred();
  routes.set('/api/conversations', async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    started.resolve();
    await ready.promise;
    json(response, conversation, 201);
  });
  const late = previous.chat.startConversation(conversation.counterpart.id);
  const rejected = assert.rejects(late, /chat has ended/);
  await started.promise;
  await app.session.logout();
  const current = await signIn(app);
  ready.resolve();
  await rejected;
  assert.equal(app.context, current);
  assert.deepEqual(current.chat.conversations.items, []);
  assert.equal(current.chat.messages.conversationId, null);
  assert.deepEqual(previous.chat.conversations.items, []);
  await assert.rejects(
    previous.chat.startConversation(conversation.counterpart.id),
    /chat has ended/,
  );
});

test('an empty conversation survives a stale list refresh and can exchange messages after starting', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 && !context.chat.conversations.pagination.loading,
  );
  const listStarted = deferred();
  const listReady = deferred();
  routes.set('/api/conversations', async (response, request) => {
    if (request.method === 'POST') {
      await requestBody(request);
      sockets[0].emit('conversation:created', conversation);
      return json(response, conversation, 201);
    }
    listStarted.resolve();
    await listReady.promise;
    json(response, { items: [], nextCursor: null });
  });
  const refresh = context.chat.loadConversations();
  await listStarted.promise;
  const sent = { ...message, senderId: user.id };
  const reply = { ...message, id: '555555555555555555555555', text: 'Welcome' };
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    assert.deepEqual(await requestBody(request), { text: 'Hello' });
    sockets[0].emit('message:created', sent);
    json(response, sent, 201);
  });
  await context.chat.startConversation(conversation.counterpart.id);
  assert.deepEqual(context.chat.messages.items, []);
  listReady.resolve();
  await refresh;
  assert.deepEqual(context.chat.conversations.items, [conversation]);
  await context.chat.sendMessage(conversation.id, 'Hello');
  sockets[0].emit('message:created', reply);
  await until(() => context.chat.messages.items.length === 2);
  assert.deepEqual(context.chat.messages.items, [sent, reply]);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, reply.id);
});

test('initial restoration distinguishes unauthorized, server and network errors and can retry', async (t) => {
  for (const failure of ['unauthorized', 'server', 'network']) {
    await t.test(failure, async (t) => {
      const { app, routes, sockets } = await fixture(t);
      routes.set('/api/auth/me', (response) => {
        if (failure === 'network') return response.destroy();
        json(
          response,
          { message: 'Unavailable' },
          failure === 'unauthorized' ? 401 : 503,
        );
      });
      assert.equal(app.auth.state.status, 'loading');
      assert.equal(app.context, null);
      await app.start();
      assert.equal(
        app.auth.state.status,
        failure === 'unauthorized' ? 'anonymous' : 'error',
      );
      assert.equal(app.context, null);
      assert.equal(sockets.length, 0);

      routes.delete('/api/auth/me');
      await app.session.restore();
      assert.equal(app.auth.state.status, 'authenticated');
      assert.deepEqual(app.auth.state.user, user);
      await until(() => sockets.length === 1);
    });
  }
});

test('starting repeatedly and rechecking an authenticated session reuse one context and socket', async (t) => {
  const { app, requests, sockets } = await fixture(t);
  const first = app.start();
  assert.equal(app.start(), first);
  await first;
  const context = app.context;
  await app.start();
  assert.equal(requests.filter((url) => url === '/api/auth/me').length, 1);
  await app.session.restore();
  await app.session.revalidate();
  await until(() => sockets.length === 1);
  assert.equal(app.context, context);
  assert.equal(app.auth.state.status, 'authenticated');
  app.dispose();
  app.dispose();
  await app.start();
  await until(() => !sockets[0].connected);
  assert.equal(app.context, null);
  assert.equal(sockets.length, 1);
});

test('login and registration use their response user without an additional session request', async (t) => {
  for (const action of ['login', 'register']) {
    await t.test(action, async (t) => {
      const { app, routes, requests, sockets } = await fixture(t);
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
      await app.session[action](input);
      assert.deepEqual(body, input);
      assert.deepEqual(app.auth.state.user, returnedUser);
      await until(() => sockets.length === 1);
      assert.equal(requests.includes('/api/auth/me'), false);
    });
  }
});

test('login and registration expose failures without creating a private context', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  routes.set('/api/auth/me', (response) =>
    json(response, { message: 'Sign in' }, 401),
  );
  await app.start();
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
      app.session[action]({
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
    assert.equal(app.auth.state.status, 'anonymous');
    assert.equal(app.context, null);
    assert.equal(sockets.length, 0);
  }
});

test('restoration applies its result when it completes after login', async (t) => {
  for (const status of [200, 401]) {
    await t.test(String(status), async (t) => {
      const { app, routes } = await fixture(t);
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
      const restoration = app.start();
      await started.promise;
      const current = await signIn(app);
      ready.resolve();
      await restoration;
      assert.notEqual(app.context, current);
      if (status === 200) {
        assert.equal(app.auth.state.status, 'authenticated');
        assert.deepEqual(app.auth.state.user, {
          ...user,
          username: 'PreviousUser',
        });
      } else {
        assert.equal(app.context, null);
        assert.equal(app.auth.state.status, 'anonymous');
      }
    });
  }
});

test('logout failures preserve the current context; an unauthorized response ends it', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  context.chat.conversationCreated(conversation);
  for (const failure of ['server', 'network']) {
    routes.set('/api/auth/logout', (response) => {
      if (failure === 'network') return response.destroy();
      json(response, { code: 'INTERNAL_ERROR', message: 'Unavailable' }, 503);
    });
    await assert.rejects(app.session.logout());
    assert.equal(app.context, context);
    assert.equal(app.auth.state.status, 'authenticated');
    assert.equal(context.chat.conversations.items.length, 1);
    assert.equal(sockets[0].connected, true);
  }
  routes.set('/api/auth/logout', (response) =>
    json(response, { message: 'Expired' }, 401),
  );
  await app.session.logout();
  await until(() => !sockets[0].connected);
  assert.equal(app.context, null);
  assert.equal(app.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
});

test('logout applies success, unauthorized responses and errors after another login', async (t) => {
  for (const status of [204, 401, 503]) {
    await t.test(String(status), async (t) => {
      const { app, routes } = await fixture(t);
      await signIn(app);
      const started = deferred();
      const ready = deferred();
      routes.set('/api/auth/logout', (response) => {
        started.resolve();
        ready.promise.then(() =>
          json(response, { message: 'Unavailable' }, status),
        );
      });
      const logout = app.session.logout();
      const result =
        status === 503 ? assert.rejects(logout, /Service unavailable/) : logout;
      await started.promise;
      const current = await signIn(app);
      ready.resolve();
      await result;
      assert.equal(app.context, status === 503 ? current : null);
      assert.equal(
        app.auth.state.status,
        status === 503 ? 'authenticated' : 'anonymous',
      );
    });
  }
});

test('socket connection failure rechecks authorization and keeps login on a network failure', async (t) => {
  for (const failure of ['network', 'unauthorized']) {
    await t.test(failure, async (t) => {
      const { app, routes, requests } = await fixture(t, {
        rejectSocket: true,
      });
      routes.set('/api/auth/me', (response) => {
        if (failure === 'network') return response.destroy();
        json(response, { message: 'Expired' }, 401);
      });
      const context = await signIn(app);
      await until(() => requests.includes('/api/auth/me'));
      if (failure === 'unauthorized') {
        await until(() => app.context === null);
        assert.equal(app.auth.state.status, 'anonymous');
      } else {
        await app.session.revalidate();
        assert.equal(app.context, context);
        assert.equal(app.auth.state.status, 'authenticated');
      }
    });
  }
});

test('disposing invalidates a pending login and prevents all later lifecycle requests', async (t) => {
  const { app, routes, requests, sockets } = await fixture(t);
  const started = deferred();
  const ready = deferred();
  routes.set('/api/auth/login', (response) => {
    started.resolve();
    ready.promise.then(() => json(response, user));
  });
  const login = signIn(app);
  await started.promise;
  app.dispose();
  ready.resolve();
  await login;
  const count = requests.length;
  await app.start();
  await app.session.restore();
  await app.session.login({ email: user.email, password: 'password123' });
  await app.session.register({ ...user, password: 'password123' });
  await app.session.logout();
  await app.session.revalidate();
  assert.equal(app.context, null);
  assert.equal(app.auth.state.status, 'anonymous');
  assert.equal(sockets.length, 0);
  assert.equal(requests.length, count);
});

test('application roots own independent authorization and chat state', async (t) => {
  const first = await fixture(t);
  const second = await fixture(t);
  await Promise.all([first.app.start(), second.app.start()]);
  const previous = first.app.context;
  const current = second.app.context;
  assert.notEqual(previous.api, current.api);
  assert.notEqual(previous.chat.messages, current.chat.messages);
  await first.app.session.logout();
  assert.equal(first.app.context, null);
  assert.equal(second.app.context, current);
  assert.equal(second.app.auth.state.status, 'authenticated');
});

test('restoration, socket events and reconnect share chat synchronization', async (t) => {
  const { app, sockets, routes } = await fixture(t);
  await app.session.restore();
  assert.equal(app.auth.state.status, 'authenticated');
  const context = app.context;
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  const socket = sockets[0];
  socket.emit('conversation:created', conversation);
  await until(() => context.chat.conversations.items.length === 1);
  context.chat.openConversation(conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
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
  routes.set('/api/conversations', (response) =>
    json(response, {
      items: [{ ...conversation, lastMessage: missed }],
      nextCursor: null,
    }),
  );
  socket.conn.close();
  await until(
    () => sockets.length === 2 && context.chat.messages.items.length === 2,
  );
  assert.equal(app.context, context);
  assert.equal(context.chat.conversations.items.length, 1);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, missed.id],
  );
});

test('a new login isolates late HTTP failures and store loads from the previous context', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const conversationsStarted = deferred();
  const conversationsResponse = deferred();
  routes.set('/api/conversations', (response) => {
    conversationsStarted.resolve();
    conversationsResponse.promise.then(() =>
      json(response, { items: [conversation], nextCursor: null }),
    );
  });
  const previous = await signIn(app);
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

  routes.delete('/api/conversations');
  const current = await signIn(app);
  assert.notEqual(current, previous);
  assert.notEqual(current.api, previous.api);
  assert.notEqual(current.chat.messages, previous.chat.messages);
  assert.notEqual(current.chat.conversations, previous.chat.conversations);

  conversationsResponse.resolve();
  meResponse.resolve();
  await rejected;
  previous.chat.applySavedMessage(message);
  previous.chat.conversationCreated(conversation);
  await until(
    () =>
      sockets.length === 2 &&
      !sockets[0].connected &&
      !current.chat.conversations.pagination.loading,
  );
  assert.equal(sockets[0].connected, false);
  assert.equal(app.auth.state.status, 'authenticated');
  assert.equal(app.context, current);
  assert.deepEqual(previous.chat.conversations.items, []);
  assert.deepEqual(current.chat.conversations.items, []);
});

test('current HTTP unauthorized and socket auth end retire the context', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const previous = await signIn(app);
  await until(() => sockets.length === 1);
  previous.chat.conversationCreated(conversation);
  sockets[0].emit('auth:ended');
  await until(() => app.context === null && !sockets[0].connected);
  assert.equal(app.auth.state.status, 'anonymous');
  assert.deepEqual(previous.chat.conversations.items, []);

  await signIn(app);
  routes.set('/api/auth/me', (response) =>
    json(response, { code: 'UNAUTHORIZED', message: 'Expired' }, 401),
  );
  await app.session.revalidate();
  assert.equal(app.context, null);
  assert.equal(app.auth.state.status, 'anonymous');
});

test('REST recovery and visibility refresh work when Socket.io is unavailable', async (t) => {
  const { app, routes, requests } = await fixture(t, {
    rejectSocket: true,
  });
  routes.set('/api/conversations', (response) =>
    json(response, { items: [conversation], nextCursor: null }),
  );
  const context = await signIn(app);
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
  app.visibilityChanged();
  await until(
    () => requests.filter((url) => url === '/api/conversations').length > count,
  );
  assert.equal(app.context, context);
  assert.equal(app.auth.state.status, 'authenticated');
});

test('disposing during restoration prevents a late response from creating a context', async (t) => {
  const { app, routes, sockets } = await fixture(t);
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
  const restoration = app.session.restore();
  await started.promise;
  app.dispose();
  responseReady.resolve();
  await restoration;
  await signIn(app);
  assert.equal(app.context, null);
  assert.equal(app.auth.state.status, 'anonymous');
  assert.equal(sockets.length, 0);
});

test('logout succeeds when the socket ends authentication before the HTTP response', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(() => sockets.length === 1);
  routes.set('/api/auth/logout', (response) => {
    sockets[0].once('disconnect', () => {
      response.writeHead(204);
      response.end();
    });
    sockets[0].emit('auth:ended');
  });
  await app.session.logout();
  assert.equal(app.context, null);
  assert.equal(app.auth.state.status, 'anonymous');
  assert.deepEqual(context.chat.conversations.items, []);
});

test('the client waits for server authorization instead of a local JWT deadline', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  routes.set('/api/auth/login', (response) => {
    response.setHeader('X-Auth-Expires-At', '2000-01-01T00:00:00.000Z');
    json(response, user);
  });
  const context = await signIn(app);
  await until(() => sockets.length === 1);
  context.chat.conversationCreated(conversation);
  t.mock.timers.enable({ apis: ['Date'] });
  t.mock.timers.setTime(Date.now() + 86400000);
  assert.equal(app.context, context);
  assert.equal(app.auth.state.status, 'authenticated');
  t.mock.timers.reset();
  sockets[0].emit('auth:ended');
  await until(() => app.context === null && !sockets[0].connected);
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

test('initial load and first-page refresh merge live events and reset the older history cursor', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
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
  context.chat.openConversation(conversation.id);
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
  await until(() => !context.chat.messages.pagination.loading);
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
  await until(() => !context.chat.messages.pagination.loading);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [live.id, boundary.id],
  );
  assert.equal(context.chat.messages.pagination.nextCursor, 'new-page');
  await context.chat.loadMessages(true);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, missed.id, live.id, boundary.id],
  );
  assert.equal(context.chat.messages.pagination.nextCursor, 'older-reconciled');
});

test('logout during recovery discards late pages and never restarts private loads', async (t) => {
  const { app, routes, requests } = await fixture(t);
  const context = await signIn(app);
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: null }),
  );
  context.chat.openConversation(conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
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
  await app.session.logout();
  ready.resolve();
  await delay(50);
  assert.equal(app.context, null);
  assert.deepEqual(context.chat.messages.items, []);
  assert.deepEqual(context.chat.conversations.items, []);
  assert.equal(
    requests.some((url) => url.includes('late-page')),
    false,
  );
});

test('conversation refresh resets to its first page and keeps newer live activity over stale REST', async (t) => {
  const { app, routes, sockets } = await fixture(t);
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
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  await context.chat.loadConversations(true);
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
  await until(() => !context.chat.conversations.pagination.loading);
  assert.deepEqual(
    context.chat.conversations.items.map((item) => item.id),
    [older.id],
  );
  assert.equal(context.chat.conversations.items[0].lastMessage.id, newer.id);
  assert.equal(
    context.chat.conversations.pagination.nextCursor,
    'refresh-rest',
  );
  await context.chat.loadConversations(true);
  assert.deepEqual(
    context.chat.conversations.items.map((item) => item.id),
    [older.id, conversation.id],
  );
  assert.equal(context.chat.conversations.pagination.nextCursor, null);
});

test('refresh reconciles late commits in its latest page and discards previously loaded older history', async (t) => {
  const { app, routes, requests, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
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
  context.chat.openConversation(conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
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
  await context.chat.loadMessages();
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, late.id, newest.id],
  );
  assert.equal(context.chat.messages.pagination.nextCursor, 'older-refreshed');
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
  await context.chat.loadMessages(true);
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
  await context.chat.loadMessages();
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [message.id, late.id, newest.id],
  );
  assert.equal(
    context.chat.messages.pagination.nextCursor,
    'loaded-older-page',
  );
  assert.equal(
    requests.some((url) => url.includes('loaded-older-page')),
    false,
  );
  await context.chat.loadMessages(true);
  assert.deepEqual(
    context.chat.messages.items.map((item) => item.id),
    [older.id, lateInOlderPage.id, message.id, late.id, newest.id],
  );
  assert.equal(context.chat.messages.pagination.nextCursor, 'unloaded-history');
  assert.equal(
    requests.some((url) => url.includes('unloaded-history')),
    false,
  );
});

test('refresh loads only the latest 50 missed messages and leaves the rest for Load more', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
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
  context.chat.openConversation(conversation.id);
  await initialStarted.promise;
  sockets[0].emit('message:created', missed[104]);
  await until(() => context.chat.messages.items.length === 1);
  initialReady.resolve();
  await until(() => !context.chat.messages.pagination.loading);

  routes.set(path, (response) =>
    json(response, { items: missed.slice(55), nextCursor: 'middle' }),
  );
  routes.set(`${path}?cursor=middle`, (response) =>
    json(response, { items: missed.slice(5, 55), nextCursor: 'oldest' }),
  );
  routes.set(`${path}?cursor=oldest`, (response) =>
    json(response, { items: missed.slice(0, 5), nextCursor: null }),
  );
  await context.chat.loadMessages();
  assert.deepEqual(context.chat.messages.items, missed.slice(55));
  assert.equal(context.chat.messages.pagination.nextCursor, 'middle');
  await context.chat.loadMessages(true);
  assert.deepEqual(context.chat.messages.items, missed.slice(5));
  assert.equal(context.chat.messages.pagination.nextCursor, 'oldest');
  await context.chat.loadMessages(true);
  assert.deepEqual(context.chat.messages.items, missed);
  assert.equal(context.chat.messages.pagination.nextCursor, null);
});

function requestBody(request) {
  return new Promise((resolve) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(JSON.parse(body)));
  });
}

test('ordinary sends merge HTTP and WS by server ID in either order and preserve newer previews', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  context.chat.conversationCreated(conversation);
  const other = { ...conversation, id: '888888888888888888888888' };
  context.chat.conversationCreated(other);
  const path = `/api/conversations/${conversation.id}/messages`;
  routes.set(path, (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
  });
  context.chat.openConversation(conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
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
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
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
  context.chat.openConversation(conversation.id);
  await until(() => !context.chat.messages.pagination.loading);
  await assert.rejects(context.chat.sendMessage(conversation.id, 'Hello'));
  await until(() => context.chat.messages.items.length === 1);
  await delay(50);
  assert.equal(bodies.length, 1);
  await context.chat.sendMessage(conversation.id, 'Hello');
  assert.deepEqual(context.chat.messages.items, [first, second]);
  assert.deepEqual(bodies, [{ text: 'Hello' }, { text: 'Hello' }]);
});

test('an unknown conversation event synchronizes through the controller and survives a stale in-flight list', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const started = deferred();
  const ready = deferred();
  routes.set('/api/conversations', async (response) => {
    started.resolve();
    await ready.promise;
    json(response, { items: [conversation], nextCursor: null });
  });
  const context = await signIn(app);
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
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
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
  await context.chat.openConversation(conversation.id);
  const send = context.chat.sendMessage(conversation.id, 'Hello');
  await started.promise;
  await context.chat.openConversation(other.id);
  ready.resolve();
  await send;
  assert.deepEqual(context.chat.messages.items, []);
  assert.equal(context.chat.conversations.items[0].lastMessage.id, message.id);

  const lateStarted = deferred();
  const lateReady = deferred();
  routes.set(path, async (response, request) => {
    if (request.method === 'GET')
      return json(response, { items: [], nextCursor: null });
    await requestBody(request);
    lateStarted.resolve();
    await lateReady.promise;
    json(response, message, 201);
  });
  const lateSend = context.chat.sendMessage(conversation.id, 'Hello');
  const rejection = assert.rejects(lateSend, /chat has ended/);
  await lateStarted.promise;
  await app.session.logout();
  const current = await signIn(app);
  lateReady.resolve();
  await rejection;
  assert.deepEqual(current.chat.messages.items, []);
  assert.deepEqual(current.chat.conversations.items, []);
  assert.deepEqual(context.chat.conversations.items, []);
  await assert.rejects(context.chat.sendMessage(conversation.id, 'Hello'));
});

test('switching conversations clears history immediately and ignores late success and failure responses', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  const other = { ...conversation, id: '888888888888888888888888' };
  const otherMessage = { ...message, conversationId: other.id };
  const path = `/api/conversations/${conversation.id}/messages`;
  const otherPath = `/api/conversations/${other.id}/messages`;
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: 'old' }),
  );
  await context.chat.openConversation(conversation.id);
  for (const status of [200, 503]) {
    const started = deferred();
    const ready = deferred();
    routes.set(path, async (response) => {
      started.resolve();
      await ready.promise;
      json(response, { items: [message], nextCursor: 'late' }, status);
    });
    const stale = context.chat.loadMessages();
    await started.promise;
    const otherReady = deferred();
    routes.set(otherPath, async (response) => {
      await otherReady.promise;
      json(response, { items: [otherMessage], nextCursor: null });
    });
    const opening = context.chat.openConversation(other.id);
    assert.equal(context.chat.messages.conversationId, other.id);
    assert.deepEqual(context.chat.messages.items, []);
    assert.equal(context.chat.messages.pagination.loading, true);
    assert.equal(context.chat.messages.pagination.nextCursor, null);
    ready.resolve();
    await stale;
    assert.equal(context.chat.messages.pagination.loading, true);
    assert.equal(context.chat.messages.pagination.error, '');
    otherReady.resolve();
    await opening;
    assert.deepEqual(context.chat.messages.items, [otherMessage]);
    routes.set(path, (response) =>
      json(response, { items: [message], nextCursor: 'old' }),
    );
    await context.chat.openConversation(conversation.id);
  }
});

test('initial history failure can retry an empty result and background errors preserve data, login and retry mode', async (t) => {
  const { app, routes, sockets } = await fixture(t);
  routes.set('/api/conversations', (response) =>
    json(response, { items: [conversation], nextCursor: 'old-list' }),
  );
  const context = await signIn(app);
  await until(
    () =>
      sockets.length === 1 &&
      context.connectionState === 'Connected' &&
      !context.chat.conversations.pagination.loading,
  );
  const path = `/api/conversations/${conversation.id}/messages`;
  const fail = (response) => json(response, { message: 'Unavailable' }, 503);
  routes.set(path, fail);
  await context.chat.openConversation(conversation.id);
  assert.equal(context.chat.messages.pagination.loading, false);
  assert.ok(context.chat.messages.pagination.error);
  assert.deepEqual(context.chat.messages.items, []);
  routes.set(path, (response) =>
    json(response, { items: [], nextCursor: null }),
  );
  await context.chat.loadMessages();
  assert.equal(context.chat.messages.pagination.error, '');
  assert.deepEqual(context.chat.messages.items, []);
  routes.set(path, (response) =>
    json(response, { items: [message], nextCursor: 'old-history' }),
  );
  await context.chat.loadMessages();
  routes.set(`${path}?cursor=old-history`, fail);
  routes.set('/api/conversations?cursor=old-list', fail);
  await Promise.all([
    context.chat.loadMessages(true),
    context.chat.loadConversations(true),
  ]);
  assert.equal(context.chat.messages.pagination.failedMode, 'next');
  assert.equal(context.chat.conversations.pagination.failedMode, 'next');
  assert.equal(context.chat.messages.pagination.nextCursor, 'old-history');
  assert.equal(context.chat.conversations.pagination.nextCursor, 'old-list');
  routes.set(path, fail);
  routes.set('/api/conversations', fail);
  await context.chat.refresh();
  assert.equal(context.chat.messages.pagination.failedMode, 'first');
  assert.equal(context.chat.conversations.pagination.failedMode, 'first');
  assert.ok(context.chat.messages.pagination.error);
  assert.ok(context.chat.conversations.pagination.error);
  assert.deepEqual(context.chat.messages.items, [message]);
  assert.deepEqual(context.chat.conversations.items, [conversation]);
  assert.equal(app.context, context);
  assert.equal(app.auth.state.status, 'authenticated');
  routes.set(path, (response) =>
    json(response, { items: [], nextCursor: null }),
  );
  routes.set('/api/conversations', (response) =>
    json(response, { items: [], nextCursor: null }),
  );
  await context.chat.refresh();
  assert.equal(context.chat.messages.pagination.error, '');
  assert.equal(context.chat.conversations.pagination.error, '');
  assert.deepEqual(context.chat.messages.items, []);
  assert.deepEqual(context.chat.conversations.items, []);
  assert.equal(context.chat.messages.pagination.nextCursor, null);
  assert.equal(context.chat.conversations.pagination.nextCursor, null);
});

test('refresh supersedes in-flight pagination and dispose invalidates pending history and list responses', async (t) => {
  for (const status of [200, 503]) {
    await t.test(`late response ${status}`, async (t) => {
      const { app, routes, sockets } = await fixture(t);
      const path = `/api/conversations/${conversation.id}/messages`;
      routes.set(path, (response) =>
        json(response, { items: [message], nextCursor: 'old-history' }),
      );
      routes.set('/api/conversations', (response) =>
        json(response, { items: [conversation], nextCursor: 'old-list' }),
      );
      const context = await signIn(app);
      await until(
        () =>
          sockets.length === 1 &&
          context.connectionState === 'Connected' &&
          !context.chat.conversations.pagination.loading,
      );
      await context.chat.openConversation(conversation.id);
      const ready = deferred();
      const historyStarted = deferred();
      const listStarted = deferred();
      routes.set(`${path}?cursor=old-history`, async (response) => {
        historyStarted.resolve();
        await ready.promise;
        json(
          response,
          { items: [message], nextCursor: 'obsolete-history' },
          status,
        );
      });
      routes.set('/api/conversations?cursor=old-list', async (response) => {
        listStarted.resolve();
        await ready.promise;
        json(
          response,
          { items: [conversation], nextCursor: 'obsolete-list' },
          status,
        );
      });
      const old = Promise.all([
        context.chat.loadMessages(true),
        context.chat.loadConversations(true),
      ]);
      await Promise.all([historyStarted.promise, listStarted.promise]);
      routes.set(path, (response) =>
        json(response, { items: [], nextCursor: 'new-history' }),
      );
      routes.set('/api/conversations', (response) =>
        json(response, { items: [], nextCursor: 'new-list' }),
      );
      await context.chat.refresh();
      ready.resolve();
      await old;
      assert.deepEqual(context.chat.messages.items, []);
      assert.deepEqual(context.chat.conversations.items, []);
      assert.equal(context.chat.messages.pagination.nextCursor, 'new-history');
      assert.equal(
        context.chat.conversations.pagination.nextCursor,
        'new-list',
      );
      const lateReady = deferred();
      const lateHistoryStarted = deferred();
      const lateListStarted = deferred();
      routes.set(path, async (response) => {
        lateHistoryStarted.resolve();
        await lateReady.promise;
        json(response, { items: [message], nextCursor: 'late' });
      });
      routes.set('/api/conversations', async (response) => {
        lateListStarted.resolve();
        await lateReady.promise;
        json(response, { items: [conversation], nextCursor: 'late' });
      });
      const late = context.chat.refresh();
      await Promise.all([lateHistoryStarted.promise, lateListStarted.promise]);
      app.dispose();
      lateReady.resolve();
      await late;
      assert.deepEqual(context.chat.messages.items, []);
      assert.deepEqual(context.chat.conversations.items, []);
      assert.equal(context.chat.messages.pagination.nextCursor, null);
      assert.equal(context.chat.conversations.pagination.nextCursor, null);
      assert.equal(context.chat.messages.pagination.loading, false);
      assert.equal(context.chat.conversations.pagination.loading, false);
    });
  }
});

test('reconnect and returning to a visible tab replace loaded ranges and paginate from new cursors', async (t) => {
  for (const trigger of ['reconnect', 'visibility']) {
    await t.test(trigger, async (t) => {
      const { app, routes, requests, sockets } = await fixture(t);
      const path = `/api/conversations/${conversation.id}/messages`;
      const older = { ...message, id: '333333333333333333333333' };
      const other = {
        ...conversation,
        id: '888888888888888888888888',
        createdAt: '2026-10-15T09:00:00.000Z',
      };
      routes.set('/api/conversations', (response) =>
        json(response, { items: [conversation], nextCursor: 'old-list' }),
      );
      routes.set('/api/conversations?cursor=old-list', (response) =>
        json(response, { items: [other], nextCursor: null }),
      );
      routes.set(path, (response) =>
        json(response, { items: [message], nextCursor: 'old-history' }),
      );
      routes.set(`${path}?cursor=old-history`, (response) =>
        json(response, { items: [older], nextCursor: null }),
      );
      const context = await signIn(app);
      await until(
        () =>
          sockets.length === 1 &&
          context.connectionState === 'Connected' &&
          !context.chat.conversations.pagination.loading,
      );
      await context.chat.openConversation(conversation.id);
      await Promise.all([
        context.chat.loadConversations(true),
        context.chat.loadMessages(true),
      ]);
      assert.equal(context.chat.messages.items.length, 2);
      assert.equal(context.chat.conversations.items.length, 2);
      const newest = {
        ...message,
        id: '555555555555555555555555',
        createdAt: '2026-10-15T11:00:00.000Z',
      };
      routes.set(path, (response) =>
        json(response, { items: [newest], nextCursor: 'new-history' }),
      );
      routes.set('/api/conversations', (response) =>
        json(response, {
          items: [{ ...conversation, lastMessage: newest }],
          nextCursor: 'new-list',
        }),
      );
      routes.set(`${path}?cursor=new-history`, (response) =>
        json(response, { items: [message, newest], nextCursor: null }),
      );
      routes.set('/api/conversations?cursor=new-list', (response) =>
        json(response, { items: [conversation, other], nextCursor: null }),
      );
      const before = requests.length;
      if (trigger === 'reconnect') {
        sockets[0].conn.close();
      } else {
        const original = Object.getOwnPropertyDescriptor(
          globalThis,
          'document',
        );
        t.after(() => {
          if (original) Object.defineProperty(globalThis, 'document', original);
          else delete globalThis.document;
        });
        const document = { visibilityState: 'hidden' };
        Object.defineProperty(globalThis, 'document', {
          configurable: true,
          value: document,
        });
        app.visibilityChanged();
        assert.equal(requests.length, before);
        document.visibilityState = 'visible';
        app.visibilityChanged();
      }
      await until(
        () =>
          context.chat.messages.pagination.nextCursor === 'new-history' &&
          context.chat.conversations.pagination.nextCursor === 'new-list',
      );
      assert.deepEqual(context.chat.messages.items, [newest]);
      assert.equal(context.chat.conversations.items.length, 1);
      assert.equal(
        context.chat.conversations.items[0].lastMessage.id,
        newest.id,
      );
      assert.equal(
        requests.slice(before).filter((url) => url === path).length,
        1,
      );
      assert.equal(
        requests.slice(before).filter((url) => url === '/api/conversations')
          .length,
        1,
      );
      assert.equal(
        requests.slice(before).some((url) => url.includes('cursor=')),
        false,
      );
      await Promise.all([
        context.chat.loadConversations(true),
        context.chat.loadMessages(true),
      ]);
      assert.deepEqual(context.chat.messages.items, [message, newest]);
      assert.deepEqual(
        context.chat.conversations.items.map((item) => item.id),
        [conversation.id, other.id],
      );
      assert.equal(
        context.chat.conversations.items[0].lastMessage.id,
        newest.id,
      );
      assert.equal(context.chat.messages.pagination.nextCursor, null);
      assert.equal(context.chat.conversations.pagination.nextCursor, null);
      const live = { ...newest, id: '666666666666666666666666' };
      const connected = sockets.at(-1);
      connected.emit('message:created', live);
      connected.emit('message:created', live);
      await until(() => context.chat.messages.items.length === 3);
      assert.deepEqual(context.chat.messages.items, [message, newest, live]);
    });
  }
});
