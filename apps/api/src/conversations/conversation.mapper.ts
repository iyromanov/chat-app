import type {
  Conversation as PublicConversation,
  PublicUser,
} from '@chat/contracts';
import type { ConversationRecord } from './conversations.repository';

export function presentConversation(
  conversation: ConversationRecord,
  counterpart: PublicUser,
): PublicConversation {
  return {
    id: conversation.id,
    counterpart,
    createdAt: conversation.createdAt.toISOString(),
    lastMessage: null,
  };
}
