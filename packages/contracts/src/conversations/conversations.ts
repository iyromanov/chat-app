import { z } from 'zod';
import { objectIdSchema } from '../common/object-id.js';
import { paginationQuerySchema } from '../common/pagination.js';
import { messageSchema } from '../messages/messages.js';
import { publicUserSchema } from '../users/users.js';

export const startConversationSchema = z.object({ userId: objectIdSchema });
export const conversationSchema = z.object({
  id: objectIdSchema,
  counterpart: publicUserSchema,
  createdAt: z.iso.datetime(),
  lastMessage: messageSchema.nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export const conversationsQuerySchema = paginationQuerySchema;
export const conversationsPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.union([z.string().min(1), z.null()]),
});
export type ConversationsPage = z.infer<typeof conversationsPageSchema>;
