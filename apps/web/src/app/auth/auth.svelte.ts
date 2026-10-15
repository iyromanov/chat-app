import { io, type Socket } from 'socket.io-client';
import { type ServerEvents, type CurrentUser } from '@chat/contracts';
import { createMessages } from '@entities/message';
import { messageSchema, type Message } from '@chat/contracts';
import { createConversations } from '@entities/conversation';
import { conversationSchema } from '@chat/contracts';
import { createApi, readAuthDeadline, ApiError } from '@shared/api';

type AuthState =
  | { status: 'loading' | 'anonymous'; user: null }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'error'; user: null; error: string };

class Auth {
  state = $state.raw<AuthState>({ status: 'loading', user: null });

  private socket?: Socket<ServerEvents>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private anonymous = () => {
    this.generation++;
    clearTimeout(this.expiryTimer);
    this.socket?.disconnect();
    this.socket = undefined;
    this.conversations.clear();
    this.messages.clear();
    this.state = { status: 'anonymous', user: null };
  };

  readonly api = createApi({ onUnauthorized: this.anonymous });

  readonly conversations = createConversations(this.api);
  readonly messages = createMessages(this.api);
  messageSaved = (message: Message) => {
    this.messages.upsert(message);
    this.conversations.applyMessage(message);
  };

  registered = (user: CurrentUser, expiresAt: number) => {
    this.anonymous();
    const generation = this.generation;
    if (expiresAt <= Date.now()) return;
    this.expiryTimer = setTimeout(() => {
      if (generation === this.generation) this.anonymous();
    }, expiresAt - Date.now());
    this.state = { status: 'authenticated', user };
    this.socket = io({ withCredentials: true });
    this.socket.on('conversation:created', (data) => {
      if (generation !== this.generation) return;
      const parsed = conversationSchema.safeParse(data);
      if (parsed.success) this.conversations.upsert(parsed.data);
    });
    this.socket.on('message:created', (data) => {
      if (generation !== this.generation) return;
      const parsed = messageSchema.safeParse(data);
      if (parsed.success) this.messageSaved(parsed.data);
    });
    this.socket.on('connect', () => {
      if (generation === this.generation) {
        void this.conversations.load();
        void this.messages.load();
      }
    });
    void this.conversations.load();
    this.socket.on('auth:ended', () => {
      if (generation === this.generation) this.anonymous();
    });
    this.socket.on('connect_error', () => {
      if (generation === this.generation) {
        void this.api.AuthController_me().catch(() => {});
        void this.conversations.load();
      }
    });
  };

  logout = async () => {
    try {
      await this.api.AuthController_logout();
      localStorage.setItem('chat:logout', crypto.randomUUID());
      this.anonymous();
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'UNAUTHORIZED')
        this.anonymous();
      else throw error;
    }
  };

  storageChanged = (event: StorageEvent) => {
    if (event.key === 'chat:logout') this.anonymous();
  };

  visibilityChanged = () => {
    if (
      document.visibilityState === 'visible' &&
      this.state.status === 'authenticated'
    ) {
      void this.api.AuthController_me().catch(() => {});
      void this.conversations.load();
      void this.messages.load();
    }
  };

  dispose = () => {
    this.anonymous();
  };

  restore = async () => {
    this.anonymous();
    const generation = this.generation;
    this.state = { status: 'loading', user: null };
    try {
      const { data, response } = await this.api.AuthController_me();
      if (generation !== this.generation) return;
      if (data) this.registered(data, readAuthDeadline(response));
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiError && error.body.code === 'UNAUTHORIZED')
        this.anonymous();
      else
        this.state = {
          status: 'error',
          user: null,
          error: 'Unable to check your session. Please try again',
        };
    }
  };
}

export function createAuth() {
  return new Auth();
}
