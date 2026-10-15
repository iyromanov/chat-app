import type { HydratedDocument } from 'mongoose';
import type { CurrentUser } from '@chat/contracts';
import type { User } from './schemas/user.schema';

export function publicUser(user: HydratedDocument<User>): CurrentUser {
  return { id: user.id as string, email: user.email, username: user.username };
}
