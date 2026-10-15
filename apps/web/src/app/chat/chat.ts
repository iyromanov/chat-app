import { conversationSchema } from '@chat/contracts/conversations';
import { messageSchema, type Message } from '@chat/contracts/messages';
import { createConversations } from '@entities/conversation';
import { createMessages } from '@entities/message';
import { createMessageComposer } from '@features/send-message';
import type { ApiClient } from '@shared/api';

export function createChat(api: ApiClient, userId: string) {
  const conversations = createConversations(api);
  let disposed = false;
  const composer = createMessageComposer(() => api, messageSaved, userId);
  const messages = createMessages(api, composer.confirm);

  function messageSaved(message: Message) {
    if (disposed) return;
    composer.confirm(message);
    messages.upsert(message);
    conversations.applyMessage(message);
  }

  return {
    conversations,
    messages,
    composer,
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
      composer.dispose();
      conversations.clear();
      messages.clear();
    },
  };
}
