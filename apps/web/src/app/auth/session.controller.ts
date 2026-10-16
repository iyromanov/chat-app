import type { Login, Registration } from '@chat/contracts/auth';
import type { CurrentUser } from '@chat/contracts/users';
import { ApiError, type ApiClient } from '@shared/api';
import type { AuthStore } from './auth.store.svelte';

export class SessionController {
  private generation = 0;
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
    const generation = ++this.generation;
    this.store.checking();
    try {
      const { data } = await this.publicApi.me();
      if (!this.isCurrent(generation)) return;
      this.signedIn(data);
    } catch (error) {
      if (!this.isCurrent(generation)) return;
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
    const generation = this.generation;
    try {
      await this.publicApi.logout();
      if (this.isCurrent(generation)) this.end();
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      if (error instanceof ApiError && error.status === 401) this.end();
      else throw error;
    }
  };

  revalidate = async () => {
    if (this.disposed || this.store.state.status !== 'authenticated') return;
    const generation = this.generation;
    try {
      await this.publicApi.me();
    } catch (error) {
      if (!this.isCurrent(generation)) return;
      if (error instanceof ApiError && error.status === 401) this.end();
    }
  };

  end = () => {
    if (this.disposed) return;
    this.generation++;
    this.onUserChanged(null);
    this.store.anonymous();
  };

  dispose = () => {
    if (this.disposed) return;
    this.end();
    this.disposed = true;
  };

  private isCurrent(generation: number) {
    return !this.disposed && generation === this.generation;
  }

  private signedIn(user: CurrentUser) {
    this.generation++;
    this.onUserChanged(user);
    this.store.authenticated(user);
  }

  private async authenticate(
    request: () => ReturnType<ApiClient['auth']['login']>,
  ) {
    if (this.disposed) return;
    const generation = ++this.generation;
    try {
      const { data } = await request();
      if (this.isCurrent(generation)) this.signedIn(data);
    } catch (error) {
      if (this.isCurrent(generation)) throw error;
    }
  }
}
