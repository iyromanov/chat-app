import { createRandomId } from '@shared/lib';
import type { CurrentUser } from '@chat/contracts/users';
import { readAuthDeadline, ApiError, type ApiClient } from '@shared/api';

const LOGOUT_STORAGE_KEY = 'chat:logout';

type AuthState =
  | { status: 'loading' | 'anonymous'; user: null }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'error'; user: null; error: string };

class Auth {
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private loginAttempt = 0;
  private disposed = false;

  state = $state.raw<AuthState>({ status: 'loading', user: null });

  constructor(
    private readonly getApi: () => ApiClient,
    private readonly onUserChanged: (user: CurrentUser | null) => void,
  ) {}

  invalidate = () => {
    this.generation++;
    clearTimeout(this.expiryTimer);
    this.onUserChanged(null);
    this.state = { status: 'anonymous', user: null };
  };

  signedIn = (user: CurrentUser, expiresAt: number) => {
    if (this.disposed) return;
    this.loginAttempt++;
    this.invalidate();
    const generation = this.generation;
    if (expiresAt <= Date.now()) return;
    this.expiryTimer = setTimeout(() => {
      if (generation === this.generation) this.invalidate();
    }, expiresAt - Date.now());
    this.state = { status: 'authenticated', user };
    this.onUserChanged(user);
  };

  logout = async () => {
    if (this.disposed) return;
    const loginAttempt = this.loginAttempt;
    try {
      await this.getApi().auth.logout();
      if (loginAttempt !== this.loginAttempt) return;
      localStorage.setItem(LOGOUT_STORAGE_KEY, createRandomId());
      this.invalidate();
    } catch (error) {
      if (loginAttempt !== this.loginAttempt) return;
      if (error instanceof ApiError && error.body.code === 'UNAUTHORIZED')
        this.invalidate();
      else throw error;
    }
  };

  storageChanged = (event: StorageEvent) => {
    if (event.key === LOGOUT_STORAGE_KEY) this.invalidate();
  };

  revalidate = async () => {
    if (this.state.status === 'authenticated')
      await this.getApi()
        .auth.me()
        .catch(() => {});
  };

  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.loginAttempt++;
    this.invalidate();
  };

  restore = async () => {
    if (this.disposed) return;
    this.loginAttempt++;
    this.invalidate();
    const generation = this.generation;
    this.state = { status: 'loading', user: null };
    try {
      const response = await this.getApi().auth.me();
      if (generation !== this.generation) return;
      if (response.data)
        this.signedIn(response.data, readAuthDeadline(response));
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof ApiError && error.body.code === 'UNAUTHORIZED')
        this.invalidate();
      else
        this.state = {
          status: 'error',
          user: null,
          error: 'Unable to check your session. Please try again',
        };
    }
  };
}

export function createAuth(
  getApi: () => ApiClient,
  onUserChanged: (user: CurrentUser | null) => void,
) {
  return new Auth(getApi, onUserChanged);
}
