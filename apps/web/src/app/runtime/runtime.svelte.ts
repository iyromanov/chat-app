import type { CurrentUser } from '@chat/contracts/users';
import { createApi } from '@shared/api';
import { createAuth } from '../auth';
import { createChat } from '../chat';
import { createRealtime } from '../realtime';

type AuthenticatedContext = {
  api: ReturnType<typeof createApi>;
  chat: ReturnType<typeof createChat>;
  dispose: () => void;
};

export function createAppRuntime(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
) {
  let generation = 0;
  let disposed = false;
  let context = $state.raw<AuthenticatedContext | null>(null);
  let api = $state.raw(createClient());
  const auth = createAuth(() => api, userChanged);

  function createClient() {
    const clientGeneration = generation;
    return createApi({
      ...options,
      onUnauthorized: () => {
        if (!disposed && clientGeneration === generation) auth.invalidate();
      },
    });
  }

  function userChanged(user: CurrentUser | null) {
    generation++;
    const previous = context;
    context = null;
    previous?.dispose();
    if (disposed) return;
    api = createClient();
    if (!user) return;

    const chat = createChat(api);
    const realtime = createRealtime(options.baseUrl, {
      connected: chat.refresh,
      connectionFailed: () => {
        auth.revalidate();
        chat.refresh();
      },
      authEnded: auth.invalidate,
      conversationCreated: chat.conversationCreated,
      messageCreated: chat.messageCreated,
    });
    context = {
      api,
      chat,
      dispose() {
        realtime.dispose();
        chat.dispose();
      },
    };
    chat.refresh();
    realtime.connect();
  }

  return {
    auth,
    get api() {
      return api;
    },
    get context() {
      return context;
    },
    visibilityChanged() {
      if (document.visibilityState !== 'visible' || !context) return;
      auth.revalidate();
      context.chat.refresh();
    },
    dispose() {
      disposed = true;
      auth.dispose();
    },
  };
}
