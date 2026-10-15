import type { Request } from 'express';
import type { CurrentUser } from '@chat/contracts';

export type AuthRequest = Request & { user: CurrentUser };
