import type { Conversation } from '@chat/contracts/conversations';
import type { Message } from '@chat/contracts/messages';

export type ConversationView = Readonly<
  Omit<Conversation, 'counterpart' | 'lastMessage'>
> & {
  readonly counterpart: Readonly<Conversation['counterpart']>;
  readonly lastMessage: Readonly<Message> | null;
};

export type ConversationsView = {
  readonly items: readonly ConversationView[];
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly error: string;
  readonly failedLoadMore: boolean;
};

class Conversations implements ConversationsView {
  private currentItems = $state.raw<Conversation[]>([]);
  private cursor = $state<string | null>(null);
  private pending = $state(false);
  private failure = $state('');
  private failedMore = $state(false);

  get items(): ConversationsView['items'] {
    return this.currentItems;
  }

  get nextCursor() {
    return this.cursor;
  }

  get loading() {
    return this.pending;
  }

  get error() {
    return this.failure;
  }

  get failedLoadMore() {
    return this.failedMore;
  }

  upsert(conversation: Conversation) {
    const previous = this.currentItems.find(
      (item) => item.id === conversation.id,
    );
    const before = previous?.lastMessage;
    const incoming = conversation.lastMessage;
    if (
      before &&
      (!incoming ||
        before.createdAt > incoming.createdAt ||
        (before.createdAt === incoming.createdAt && before.id > incoming.id))
    )
      conversation = { ...conversation, lastMessage: before };
    this.currentItems = [
      ...this.currentItems.filter((item) => item.id !== conversation.id),
      conversation,
    ].sort(
      (a, b) =>
        (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(
          a.lastMessage?.createdAt ?? a.createdAt,
        ) || b.id.localeCompare(a.id),
    );
  }

  applyMessage(message: Message) {
    const conversation = this.currentItems.find(
      (item) => item.id === message.conversationId,
    );
    if (!conversation) return false;
    this.upsert({ ...conversation, lastMessage: message });
    return true;
  }

  receivePage(
    items: Conversation[],
    nextCursor: string | null,
    more: boolean,
    eventIds: ReadonlySet<string>,
  ) {
    // Merge before trimming so a stale response cannot roll back a known preview.
    for (const item of items) this.upsert(item);
    if (!more) {
      const ids = new Set([...items.map((item) => item.id), ...eventIds]);
      this.currentItems = this.currentItems.filter((item) => ids.has(item.id));
    }
    this.cursor = nextCursor;
    this.pending = false;
  }

  beginLoad() {
    this.pending = true;
    this.failure = '';
    this.failedMore = false;
  }

  failLoad(more: boolean) {
    this.pending = false;
    this.failedMore = more;
    this.failure = 'Unable to load conversations. Please try again';
  }

  clear() {
    this.currentItems = [];
    this.cursor = null;
    this.pending = false;
    this.failure = '';
    this.failedMore = false;
  }
}

export type ConversationStore = Conversations;

export function createConversations(): ConversationStore {
  return new Conversations();
}
