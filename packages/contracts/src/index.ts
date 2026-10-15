import { z } from 'zod';

export const registrationSchema = z.object({
  email: z.email('Enter a valid email').trim().max(254),
  username: z
    .string()
    .regex(
      /^[A-Za-z0-9_]{3,30}$/,
      'Username must contain 3–30 Latin letters, digits or underscores',
    ),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters'),
});
export const loginSchema = registrationSchema.pick({
  email: true,
  password: true,
});
export type Login = z.infer<typeof loginSchema>;

export const currentUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  username: z.string(),
});
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.array(z.string())).optional(),
});
export type Registration = z.infer<typeof registrationSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type ApiErrorBody = z.infer<typeof errorSchema>;

export const authReadySchema = z.object({ expiresAt: z.iso.datetime() });
export interface ServerEvents {
  'auth:ready': (data: z.infer<typeof authReadySchema>) => void;
  'auth:ended': () => void;
  'conversation:created': (data: Conversation) => void;
}

export const AUTH_EXPIRES_HEADER = 'X-Auth-Expires-At';
export const authDeadlineSchema = z.iso.datetime();

export const publicUserSchema = currentUserSchema.omit({ email: true });
export type PublicUser = z.infer<typeof publicUserSchema>;
export const usersQuerySchema = z.object({
  search: z.string().max(100).optional(),
  cursor: z.string().min(1).max(2048).optional(),
});
export const usersPageSchema = z.object({
  items: z.array(publicUserSchema),
  nextCursor: z.union([z.string().min(1), z.null()]),
});

export type UsersPage = z.infer<typeof usersPageSchema>;

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Enter a valid user ID');
export const startConversationSchema = z.object({ userId: objectIdSchema });
export const conversationSchema = z.object({
  id: objectIdSchema,
  counterpart: publicUserSchema,
  createdAt: z.iso.datetime(),
  lastMessage: z.null(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export const conversationsQuerySchema = usersQuerySchema.pick({ cursor: true });
export const conversationsPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.union([z.string().min(1), z.null()]),
});
export type ConversationsPage = z.infer<typeof conversationsPageSchema>;
