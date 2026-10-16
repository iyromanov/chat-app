import {
  conversationSchema,
  type Conversation,
} from '@chat/contracts/conversations';
import {
  messageSchema,
  sendMessageSchema,
  type Message,
} from '@chat/contracts/messages';
import type {
  ConversationsStore,
  ConversationsState,
} from '@entities/conversation';
import type { MessagesStore, MessagesState } from '@entities/message';
import type { UsersPage } from '@chat/contracts/users';
import type { ApiClient } from '@shared/api';

export class ChatController {
  private disposed = false;
  private messageGeneration = 0;
  private conversationGeneration = 0;
  private selectionGeneration = 0;
  private messageEvents = new Set<string>();
  private conversationEvents = new Set<string>();
  private unknownMessages = new Map<string, Message>();

  readonly conversations: ConversationsState;
  readonly messages: MessagesState;

  constructor(
    private readonly api: ApiClient,
    private readonly conversationsStore: ConversationsStore,
    private readonly messagesStore: MessagesStore,
  ) {
    this.conversations = conversationsStore;
    this.messages = messagesStore;
  }

  searchUsers = async (search: string, cursor?: string): Promise<UsersPage> => {
    if (this.disposed) throw new Error('This chat has ended');
    const { data } = await this.api.users.list({ search, cursor });
    if (this.disposed) throw new Error('This chat has ended');
    if (!data) throw new Error('Missing users');
    return data;
  };

  startConversation = async (userId: string): Promise<Conversation | null> => {
    if (this.disposed) throw new Error('This chat has ended');
    const generation = ++this.selectionGeneration;
    try {
      const { data } = await this.api.conversations.start({ userId });
      if (this.disposed) throw new Error('This chat has ended');
      if (generation !== this.selectionGeneration) return null;
      if (!data) throw new Error('Missing conversation');
      this.conversationCreated(data);
      this.openConversation(data.id);
      return data;
    } catch (error) {
      if (!this.disposed && generation !== this.selectionGeneration)
        return null;
      throw error;
    }
  };

  openConversation = async (conversationId: string): Promise<void> => {
    if (this.disposed) return;
    this.selectionGeneration++;
    if (this.messages.conversationId === conversationId) return;
    this.messageEvents.clear();
    this.messagesStore.select(conversationId);
    await this.loadMessages();
  };

  loadMessages = async (more = false): Promise<void> => {
    const conversationId = this.messages.conversationId;
    if (this.disposed || !conversationId) return;
    if (more && (this.messages.loading || !this.messages.nextCursor)) return;
    const generation = ++this.messageGeneration;
    const cursor = more ? this.messages.nextCursor : null;
    if (!this.messages.loading) this.messageEvents.clear();
    this.messagesStore.beginLoad();
    try {
      const { data } = await this.api.messages.list(conversationId, {
        cursor: cursor ?? undefined,
      });
      if (this.disposed || generation !== this.messageGeneration) return;
      if (!data) throw new Error('Missing messages');
      this.messagesStore.receivePage(
        data.items,
        data.nextCursor,
        more,
        this.messageEvents,
      );
    } catch {
      if (!this.disposed && generation === this.messageGeneration)
        this.messagesStore.failLoad(more);
    } finally {
      if (generation === this.messageGeneration) this.messageEvents.clear();
    }
  };

  loadConversations = async (more = false): Promise<void> => {
    if (this.disposed) return;
    if (more && (this.conversations.loading || !this.conversations.nextCursor))
      return;
    const generation = ++this.conversationGeneration;
    const cursor = more ? this.conversations.nextCursor : null;
    if (!this.conversations.loading) this.conversationEvents.clear();
    this.conversationsStore.beginLoad();
    try {
      const { data } = await this.api.conversations.list({
        cursor: cursor ?? undefined,
      });
      if (this.disposed || generation !== this.conversationGeneration) return;
      if (!data) throw new Error('Missing conversations');
      this.conversationsStore.receivePage(
        data.items,
        data.nextCursor,
        more,
        this.conversationEvents,
      );
      for (const message of this.unknownMessages.values())
        this.conversationsStore.applyMessage(message);
      this.unknownMessages.clear();
    } catch {
      if (!this.disposed && generation === this.conversationGeneration)
        this.conversationsStore.failLoad(more);
    } finally {
      if (generation === this.conversationGeneration)
        this.conversationEvents.clear();
    }
  };

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
    this.messagesStore.upsert(message);
    if (
      this.messages.loading &&
      message.conversationId === this.messages.conversationId
    )
      this.messageEvents.add(message.id);
    if (this.conversations.loading)
      this.conversationEvents.add(message.conversationId);
    if (!this.conversationsStore.applyMessage(message)) {
      const previous = this.unknownMessages.get(message.conversationId);
      if (
        !previous ||
        message.createdAt > previous.createdAt ||
        (message.createdAt === previous.createdAt && message.id > previous.id)
      )
        this.unknownMessages.set(message.conversationId, message);
      this.loadConversations();
    }
  };

  conversationCreated = (data: unknown) => {
    if (this.disposed) return;
    const parsed = conversationSchema.safeParse(data);
    if (!parsed.success) return;
    this.conversationsStore.upsert(parsed.data);
    if (this.conversations.loading) this.conversationEvents.add(parsed.data.id);
    const message = this.unknownMessages.get(parsed.data.id);
    if (message) {
      this.conversationsStore.applyMessage(message);
      this.unknownMessages.delete(parsed.data.id);
    }
  };

  messageCreated = (data: unknown) => {
    const parsed = messageSchema.safeParse(data);
    if (parsed.success) this.applySavedMessage(parsed.data);
  };

  refresh = async (): Promise<void> => {
    await Promise.all([this.loadConversations(), this.loadMessages()]);
  };

  dispose = () => {
    this.disposed = true;
    this.messageGeneration++;
    this.conversationGeneration++;
    this.messageEvents.clear();
    this.conversationEvents.clear();
    this.unknownMessages.clear();
    this.conversationsStore.clear();
    this.messagesStore.clear();
  };
}
