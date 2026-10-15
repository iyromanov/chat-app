import type { z } from 'zod';
import type { authReadySchema } from '../auth/auth.js';
import type { Message } from '../messages/messages.js';
import type { Conversation } from '../conversations/conversations.js';

export interface ServerEvents {
  'auth:ready': (data: z.infer<typeof authReadySchema>) => void;
  'auth:ended': () => void;
  'message:created': (data: Message) => void;
  'conversation:created': (data: Conversation) => void;
}
