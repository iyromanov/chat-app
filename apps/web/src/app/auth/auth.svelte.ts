import type { CurrentUser } from '@chat/contracts/users';

type AuthState =
  | { readonly status: 'loading' | 'anonymous'; readonly user: null }
  | { readonly status: 'authenticated'; readonly user: Readonly<CurrentUser> }
  | { readonly status: 'error'; readonly user: null; readonly error: string };

export type AuthView = { readonly state: AuthState };

export class AuthStore {
  private current = $state.raw<AuthState>({ status: 'loading', user: null });

  get state(): AuthState {
    return this.current;
  }

  checking() {
    this.current = { status: 'loading', user: null };
  }

  authenticated(user: CurrentUser) {
    this.current = { status: 'authenticated', user };
  }

  anonymous() {
    this.current = { status: 'anonymous', user: null };
  }

  failed() {
    this.current = {
      status: 'error',
      user: null,
      error: 'Unable to check your session. Please try again',
    };
  }
}
