import { io, type Socket } from 'socket.io-client';
import {
  authReadySchema,
  type ServerEvents,
  type CurrentUser,
} from '@chat/contracts';
import { createApi, ApiError } from '@shared/api';

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
    this.state = { status: 'anonymous', user: null };
  };

  readonly api = createApi({ onUnauthorized: this.anonymous });

  registered = (user: CurrentUser) => {
    this.socket?.disconnect();
    this.state = { status: 'authenticated', user };
    this.socket = io({ withCredentials: true });
    this.socket.on('auth:ended', this.anonymous);
    this.socket.on('auth:ready', (data) => {
      const parsed = authReadySchema.safeParse(data);
      if (!parsed.success) return;
      clearTimeout(this.expiryTimer);
      this.expiryTimer = setTimeout(
        this.anonymous,
        Math.max(0, Date.parse(parsed.data.expiresAt) - Date.now()),
      );
    });
    this.socket.on('connect_error', () => {
      void this.api.AuthController_me().catch(() => {});
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
      const { data } = await this.api.AuthController_me();
      if (generation !== this.generation) return;
      if (data) this.registered(data);
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
