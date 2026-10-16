import type { CurrentUser } from '@chat/contracts/users';

type Authentication =
  | { readonly status: 'loading' | 'anonymous'; readonly user: null }
  | { readonly status: 'authenticated'; readonly user: Readonly<CurrentUser> }
  | { readonly status: 'error'; readonly user: null; readonly error: string };

export type AuthState = { readonly state: Authentication };

export class AuthStore implements AuthState {
  private current = $state.raw<Authentication>({
    status: 'loading',
    user: null,
  });

  get state(): Authentication {
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
