import type { CurrentUser } from '@chat/contracts/users';
import { createApi } from '@shared/api';
import { AuthStore, SessionController, type AuthState } from './auth';
import { ChatController } from './chat';
import { ConversationsStore } from '@entities/conversation';
import { MessagesStore } from '@entities/message';
import { createRealtimeClient } from './realtime';

type AuthenticatedContext = {
  api: ReturnType<typeof createApi>;
  chat: ChatController;
  connectionState: string;
  dispose: () => void;
};

export function createApplication(
  options: { baseUrl?: string; fetch?: typeof fetch } = {},
) {
  let disposed = false;
  let started: Promise<void> | undefined;
  let context = $state.raw<AuthenticatedContext | null>(null);
  const auth = new AuthStore();
  const publicApi = createApi({ ...options, onUnauthorized: () => {} });
  const session = new SessionController(auth, publicApi.auth, userChanged);

  function userChanged(user: CurrentUser | null) {
    const previous = context;
    context = null;
    previous?.dispose();
    if (disposed) return;
    if (!user) return;

    let contextDisposed = false;
    const api = createApi({
      ...options,
      onUnauthorized: () => {
        if (!contextDisposed) session.end();
      },
    });

    const chat = new ChatController(
      api,
      new ConversationsStore(),
      new MessagesStore(),
    );

    let connectionState = $state('Connecting…');

    const realtimeClient = createRealtimeClient(options.baseUrl, {
      connected: () => {
        connectionState = 'Connected';
        chat.refresh();
      },
      disconnected: () => {
        connectionState = 'Disconnected — reconnecting…';
      },
      connectionFailed: () => {
        connectionState = 'Disconnected — reconnecting…';
        if (!contextDisposed) session.revalidate();
      },
      authEnded: () => {
        if (!contextDisposed) session.end();
      },
      conversationCreated: chat.conversationCreated,
      messageCreated: chat.messageCreated,
    });

    context = {
      api,
      chat,
      get connectionState() {
        return connectionState;
      },
      dispose() {
        contextDisposed = true;
        realtimeClient.dispose();
        chat.dispose();
      },
    };

    chat.refresh();
    realtimeClient.connect();
  }

  return {
    auth: auth as AuthState,
    session,
    get context() {
      return context;
    },
    visibilityChanged() {
      if (document.visibilityState !== 'visible' || !context) return;
      session.revalidate();
      context.chat.refresh();
    },
    start() {
      if (disposed) return Promise.resolve();
      if (!started) {
        started = session.restore();
      }
      return started;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.dispose();
    },
  };
}
