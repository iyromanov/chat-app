import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import svelteConfig from '../svelte.config.js';

const server = await createServer({
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
after(() => server.close());

test('sending and logout work without crypto.randomUUID', async () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'localStorage',
  );
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  });
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem: (key, value) => storage.set(key, value) },
  });
  try {
    const { createMessageComposer } = await server.ssrLoadModule(
      '/src/features/send-message/message-composer.svelte.ts',
    );
    const requests = [];
    const saved = [];
    const composer = createMessageComposer(
      () => ({
        MessagesController_send: async ({ body }) => {
          requests.push(body);
          if (requests.length === 1) throw new Error('Response lost');
          return { data: { id: 'saved-message', ...body } };
        },
      }),
      (message) => saved.push(message),
    );
    composer.open('conversation');
    composer.drafts.conversation.text = 'Hello';
    await composer.send('conversation');
    assert.equal(requests.length, 1);
    assert.match(requests[0].attemptId, /^[a-f0-9]{32}$/);
    await composer.send('conversation');
    assert.equal(requests[1].attemptId, requests[0].attemptId);
    assert.equal(saved.length, 1);
    assert.equal(composer.drafts.conversation.text, '');
    composer.drafts.conversation.text = 'Another message';
    await composer.send('conversation');
    assert.notEqual(requests[2].attemptId, requests[0].attemptId);

    const { createAuth } = await server.ssrLoadModule(
      '/src/app/auth/auth.svelte.ts',
    );
    const auth = createAuth();
    auth.api.AuthController_logout = async () => ({});
    await auth.logout();
    assert.equal(auth.state.status, 'anonymous');
    const firstLogout = storage.get('chat:logout');
    assert.match(firstLogout, /^[a-f0-9]{32}$/);
    await auth.logout();
    assert.notEqual(storage.get('chat:logout'), firstLogout);
  } finally {
    for (const [key, descriptor] of [
      ['crypto', originalCrypto],
      ['localStorage', originalStorage],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
