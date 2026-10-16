import { conversationSchema } from '@chat/contracts/conversations';
import {
  messageSchema,
  sendMessageSchema,
  type Message,
} from '@chat/contracts/messages';
import type { ConversationStore } from '@entities/conversation';
import type { MessageStore } from '@entities/message';
import type { ApiClient } from '@shared/api';

export class ChatController {
  private disposed = false;

  constructor(
    private readonly api: ApiClient,
    readonly conversations: ConversationStore,
    readonly messages: MessageStore,
  ) {}

  sendMessage = async (conversationId: string, text: string): Promise<void> => {
    if (this.disposed) throw new Error('This chat has ended');
    const input = sendMessageSchema.parse({ text });
    const { data } = await this.api.messages.send(conversationId, input);
    if (this.disposed) throw new Error('This chat has ended');
    if (!data) throw new Error('Missing saved message');
    this.applySavedMessage(data);
  };

  applySavedMessage = (message: Message) => {
    if (this.disposed) return;
    this.messages.upsert(message);
    if (!this.conversations.applyMessage(message))
      this.synchronizeConversation(message);
  };

  conversationCreated = (data: unknown) => {
    if (this.disposed) return;
    const parsed = conversationSchema.safeParse(data);
    if (parsed.success) this.conversations.upsert(parsed.data);
  };

  messageCreated = (data: unknown) => {
    const parsed = messageSchema.safeParse(data);
    if (parsed.success) this.applySavedMessage(parsed.data);
  };

  refresh = () => {
    if (this.disposed) return;
    this.conversations.load();
    this.messages.load();
  };

  dispose = () => {
    this.disposed = true;
    this.conversations.clear();
    this.messages.clear();
  };

  private async synchronizeConversation(message: Message): Promise<void> {
    // The legacy loader owns its loading/error state until ticket 03.
    await this.conversations.load();
    if (!this.disposed) this.conversations.applyMessage(message);
  }
}
