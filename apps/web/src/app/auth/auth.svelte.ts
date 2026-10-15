import type { CurrentUser } from '@chat/contracts';
import { createApi, ApiError } from '@shared/api';

type AuthState =
  | { status: 'loading' | 'anonymous'; user: null }
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'error'; user: null; error: string };

class Auth {
  state = $state.raw<AuthState>({ status: 'loading', user: null });

  private anonymous = () => {
    this.state = { status: 'anonymous', user: null };
  };

  readonly api = createApi({ onUnauthorized: this.anonymous });

  registered = (user: CurrentUser) => {
    this.state = { status: 'authenticated', user };
  };

  restore = async () => {
    this.state = { status: 'loading', user: null };
    try {
      const { data } = await this.api.AuthController_me();
      if (data) this.registered(data);
    } catch (error) {
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
