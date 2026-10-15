import type { CurrentUser } from '@chat/contracts/users';
import type { UserRecord } from './user.record';

export function publicUser(user: UserRecord): CurrentUser {
  return { id: user.id, email: user.email, username: user.username };
}
