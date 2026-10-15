import { z } from 'zod';
import { paginationQuerySchema } from '../common/pagination.js';

export const currentUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  username: z.string(),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const publicUserSchema = currentUserSchema.omit({ email: true });
export type PublicUser = z.infer<typeof publicUserSchema>;
export const usersQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(100).optional(),
});
export const usersPageSchema = z.object({
  items: z.array(publicUserSchema),
  nextCursor: z.union([z.string().min(1), z.null()]),
});

export type UsersPage = z.infer<typeof usersPageSchema>;
