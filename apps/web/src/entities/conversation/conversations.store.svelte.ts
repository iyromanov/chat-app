import { CursorPaginationStore, type CursorPaginationState } from '@shared/lib';
import type { Conversation } from '@chat/contracts/conversations';
import type { Message } from '@chat/contracts/messages';

export type ReadonlyConversation = Readonly<
  Omit<Conversation, 'counterpart' | 'lastMessage'>
> & {
  readonly counterpart: Readonly<Conversation['counterpart']>;
  readonly lastMessage: Readonly<Message> | null;
};

export type ConversationsState = {
  readonly items: readonly ReadonlyConversation[];
  readonly pagination: CursorPaginationState;
};

export class ConversationsStore implements ConversationsState {
  private currentItems = $state.raw<Conversation[]>([]);
  readonly pagination = new CursorPaginationStore();

  get items(): ConversationsState['items'] {
    return this.currentItems;
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
    more: boolean,
    eventIds: ReadonlySet<string>,
  ) {
    // Merge before trimming so a stale response cannot roll back a known preview.
    for (const item of items) this.upsert(item);
    if (!more) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Temporary lookup; not reactive state.
      const ids = new Set([...items.map((item) => item.id), ...eventIds]);
      this.currentItems = this.currentItems.filter((item) => ids.has(item.id));
    }
  }

  clear() {
    this.currentItems = [];
    this.pagination.reset();
  }
}
