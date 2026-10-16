import type { Message as PublicMessage } from '@chat/contracts/messages';
import type { Types } from 'mongoose';
import type { Message } from './message.schema';

export type StoredMessage = Message & { _id: Types.ObjectId };
export function presentMessage(row: StoredMessage): PublicMessage {
  return {
    id: row._id.toString(),
    conversationId: row.conversationId,
    senderId: row.senderId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}
