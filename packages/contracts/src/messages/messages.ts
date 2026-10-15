import { z } from 'zod';
import { objectIdSchema } from '../common/object-id.js';
import { paginationQuerySchema } from '../common/pagination.js';

export const messageTextSchema = z
  .string()
  .trim()
  .min(1, 'Enter a message')
  .max(2000, 'Use at most 2000 characters');
export const sendMessageSchema = z.object({
  text: messageTextSchema,
  attemptId: z.string().min(1).max(100),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;
export const messageSchema = z.object({
  id: objectIdSchema,
  conversationId: objectIdSchema,
  senderId: objectIdSchema,
  text: messageTextSchema,
  attemptId: z.string(),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const messagesQuerySchema = paginationQuerySchema.extend({
  after: z.union([objectIdSchema, z.literal('start')]).optional(),
});
export const messagesPageSchema = z.object({
  items: z.array(messageSchema),
  nextCursor: z.union([z.string().min(1), z.null()]),
});
export type MessagesPage = z.infer<typeof messagesPageSchema>;

export const messageParamsSchema = z.object({ conversationId: objectIdSchema });
