import type { Conversation as PublicConversation } from '@chat/contracts/conversations';
import type { PublicUser } from '@chat/contracts/users';
import type { ConversationRecord } from './conversations.repository';

export function presentConversation(
  conversation: ConversationRecord,
  counterpart: PublicUser,
): PublicConversation {
  return {
    id: conversation.id,
    counterpart,
    createdAt: conversation.createdAt.toISOString(),
    lastMessage: conversation.lastMessage ?? null,
  };
}
