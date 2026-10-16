import type { Conversation } from '@chat/contracts/conversations';
import type { Message } from '@chat/contracts/messages';
import type { ApiClient } from '@shared/api';

class Conversations {
  private generation = 0;

  private refreshPending = false;
  private loadingTask: Promise<void> | null = null;

  items = $state.raw<Conversation[]>([]);

  nextCursor = $state<string | null>(null);

  loading = $state(false);

  error = $state('');

  constructor(private readonly api: ApiClient) {}

  upsert = (conversation: Conversation) => {
    const previous = this.items.find((item) => item.id === conversation.id);
    const before = previous?.lastMessage;
    const incoming = conversation.lastMessage;
    if (
      before &&
      (!incoming ||
        before.createdAt > incoming.createdAt ||
        (before.createdAt === incoming.createdAt && before.id > incoming.id))
    )
      conversation = { ...conversation, lastMessage: before };
    this.items = [
      ...this.items.filter((item) => item.id !== conversation.id),
      conversation,
    ].sort(
      (a, b) =>
        (b.lastMessage?.createdAt ?? b.createdAt).localeCompare(
          a.lastMessage?.createdAt ?? a.createdAt,
        ) || b.id.localeCompare(a.id),
    );
  };

  applyMessage = (message: Message) => {
    const conversation = this.items.find(
      (item) => item.id === message.conversationId,
    );
    if (!conversation) return false;
    this.upsert({ ...conversation, lastMessage: message });
    return true;
  };

  clear = () => {
    this.generation++;
    this.refreshPending = false;
    this.loadingTask = null;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    this.error = '';
  };

  load = (more = false): Promise<void> => {
    if (this.loading) {
      if (!more) this.refreshPending = true;
      return this.loadingTask ?? Promise.resolve();
    }
    this.loadingTask = this.loadPages(more);
    return this.loadingTask;
  };

  private async loadPages(more: boolean): Promise<void> {
    if (more && !this.nextCursor) return;
    const generation = this.generation;
    this.loading = true;
    this.error = '';
    try {
      let remaining = more ? [] : this.items.map((item) => item.id);
      let cursor = more ? this.nextCursor : null;
      do {
        const { data } = await this.api.conversations.list({
          cursor: cursor ?? undefined,
        });
        if (generation !== this.generation || !data) return;
        for (const item of data.items) {
          this.upsert(item);
          remaining = remaining.filter((id) => id !== item.id);
        }
        cursor = data.nextCursor;
        this.nextCursor = cursor;
      } while (!more && cursor && remaining.length);
    } catch {
      if (generation === this.generation)
        this.error = 'Unable to load conversations. Please try again';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          await this.loadPages(false);
        }
      }
    }
  }
}
export type ConversationStore = Conversations;

export function createConversations(api: ApiClient) {
  return new Conversations(api);
}
