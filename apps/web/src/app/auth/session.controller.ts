import type { Login, Registration } from '@chat/contracts/auth';
import type { CurrentUser } from '@chat/contracts/users';
import { ApiError, type ApiClient } from '@shared/api';
import type { AuthStore } from './auth.store.svelte';

export class SessionController {
  private disposed = false;

  constructor(
    private readonly store: AuthStore,
    private readonly publicApi: ApiClient['auth'],
    private readonly onUserChanged: (user: CurrentUser | null) => void,
  ) {}

  restore = async () => {
    if (this.disposed) return;
    if (this.store.state.status === 'authenticated') {
      await this.revalidate();
      return;
    }
    this.store.checking();
    try {
      const { data } = await this.publicApi.me();
      if (this.disposed) return;
      this.signedIn(data);
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof ApiError && error.status === 401) this.end();
      else this.store.failed();
    }
  };

  login = (input: Login) =>
    this.authenticate(() => this.publicApi.login(input));

  register = (input: Registration) =>
    this.authenticate(() => this.publicApi.register(input));

  logout = async () => {
    if (this.disposed || this.store.state.status !== 'authenticated') return;
    try {
      await this.publicApi.logout();
      this.end();
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof ApiError && error.status === 401) this.end();
      else throw error;
    }
  };

  revalidate = async () => {
    if (this.disposed || this.store.state.status !== 'authenticated') return;
    try {
      await this.publicApi.me();
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof ApiError && error.status === 401) this.end();
    }
  };

  end = () => {
    if (this.disposed) return;
    this.onUserChanged(null);
    this.store.anonymous();
  };

  dispose = () => {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
  };

  private signedIn(user: CurrentUser) {
    this.onUserChanged(user);
    this.store.authenticated(user);
  }

  private async authenticate(
    request: () => ReturnType<ApiClient['auth']['login']>,
  ) {
    if (this.disposed) return;
    try {
      const { data } = await request();
      if (!this.disposed) this.signedIn(data);
    } catch (error) {
      if (!this.disposed) throw error;
    }
  }
}
