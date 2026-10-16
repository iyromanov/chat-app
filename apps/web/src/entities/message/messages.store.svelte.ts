import type { Message } from '@chat/contracts/messages';

export type MessagesState = {
  readonly conversationId: string | null;
  readonly items: readonly Readonly<Message>[];
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly error: string;
  readonly failedLoadMore: boolean;
};

export class MessagesStore implements MessagesState {
  private currentConversationId = $state<string | null>(null);
  private currentItems = $state.raw<Message[]>([]);
  private cursor = $state<string | null>(null);
  private pending = $state(false);
  private failure = $state('');
  private failedMore = $state(false);

  get conversationId() {
    return this.currentConversationId;
  }

  get items(): MessagesState['items'] {
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

  select(conversationId: string) {
    this.clear();
    this.currentConversationId = conversationId;
  }

  upsert(message: Message) {
    if (message.conversationId !== this.currentConversationId) return;
    this.currentItems = [
      ...this.currentItems.filter((item) => item.id !== message.id),
      message,
    ].sort(compareMessages);
  }

  receivePage(
    items: Message[],
    nextCursor: string | null,
    more: boolean,
    eventIds: ReadonlySet<string>,
  ) {
    if (!more) {
      const newest = items.at(-1);
      this.currentItems = this.currentItems.filter(
        (item) =>
          eventIds.has(item.id) ||
          (newest && compareMessages(item, newest) > 0),
      );
    }
    for (const item of items) this.upsert(item);
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
    this.failure = 'Unable to load messages. Please try again';
  }

  clear() {
    this.currentConversationId = null;
    this.currentItems = [];
    this.cursor = null;
    this.pending = false;
    this.failure = '';
    this.failedMore = false;
  }
}

function compareMessages(a: Message, b: Message) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
