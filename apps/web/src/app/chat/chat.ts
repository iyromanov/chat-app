import {
  conversationSchema,
  messageSchema,
  type Message,
} from '@chat/contracts';
import { createConversations } from '@entities/conversation';
import { createMessages } from '@entities/message';
import type { ApiClient } from '@shared/api';

export function createChat(api: ApiClient) {
  const conversations = createConversations(api);
  const messages = createMessages(api);
  let disposed = false;

  function messageSaved(message: Message) {
    if (disposed) return;
    messages.upsert(message);
    conversations.applyMessage(message);
  }

  return {
    conversations,
    messages,
    messageSaved,
    conversationCreated(data: unknown) {
      if (disposed) return;
      const parsed = conversationSchema.safeParse(data);
      if (parsed.success) conversations.upsert(parsed.data);
    },
    messageCreated(data: unknown) {
      const parsed = messageSchema.safeParse(data);
      if (parsed.success) messageSaved(parsed.data);
    },
    refresh() {
      if (disposed) return;
      conversations.load();
      messages.load();
    },
    dispose() {
      disposed = true;
      conversations.clear();
      messages.clear();
    },
  };
}
