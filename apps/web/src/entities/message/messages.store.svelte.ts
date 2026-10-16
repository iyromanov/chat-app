import { CursorPaginationStore, type CursorPaginationState } from '@shared/lib';
import type { Message } from '@chat/contracts/messages';

export type MessagesState = {
  readonly conversationId: string | null;
  readonly items: readonly Readonly<Message>[];
  readonly pagination: CursorPaginationState;
};

export class MessagesStore implements MessagesState {
  private currentConversationId = $state<string | null>(null);
  private currentItems = $state.raw<Message[]>([]);
  readonly pagination = new CursorPaginationStore();

  get conversationId() {
    return this.currentConversationId;
  }

  get items(): MessagesState['items'] {
    return this.currentItems;
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

  receivePage(items: Message[], more: boolean, eventIds: ReadonlySet<string>) {
    if (!more) {
      const newest = items.at(-1);
      this.currentItems = this.currentItems.filter(
        (item) =>
          eventIds.has(item.id) ||
          (newest && compareMessages(item, newest) > 0),
      );
    }
    for (const item of items) this.upsert(item);
  }

  clear() {
    this.currentConversationId = null;
    this.currentItems = [];
    this.pagination.reset();
  }
}

function compareMessages(a: Message, b: Message) {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
