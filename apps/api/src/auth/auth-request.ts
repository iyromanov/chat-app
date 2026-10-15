import type { Request } from 'express';
import type { CurrentUser } from '@chat/contracts/users';

export type LoginIdentity = { loginId: string; expiresAt: Date };
export type AuthRequest = Request & { user: CurrentUser; auth: LoginIdentity };
