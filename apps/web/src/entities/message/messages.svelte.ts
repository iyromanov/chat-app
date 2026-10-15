import type { Message } from '@chat/contracts';
import type { ApiClient } from '@shared/api';
class Messages {
  conversationId = $state<string | null>(null);
  items = $state.raw<Message[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  error = $state('');
  private generation = 0;
  private refreshPending = false;
  constructor(private readonly api: ApiClient) {}
  upsert = (message: Message) => {
    if (message.conversationId !== this.conversationId) return;
    this.items = [
      ...this.items.filter((item) => item.id !== message.id),
      message,
    ].sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  };
  open = (conversationId: string) => {
    if (this.conversationId === conversationId) return;
    this.clear();
    this.conversationId = conversationId;
    void this.load();
  };
  clear = () => {
    this.generation++;
    this.conversationId = null;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    this.error = '';
    this.refreshPending = false;
  };
  load = async (more = false) => {
    if (!this.conversationId) return;
    if (this.loading) {
      if (!more) this.refreshPending = true;
      return;
    }
    if (more && !this.nextCursor) return;
    const generation = this.generation;
    const conversationId = this.conversationId;
    this.loading = true;
    this.error = '';
    try {
      const { data } = await this.api.MessagesController_list({
        params: {
          path: { conversationId },
          query: { cursor: more ? this.nextCursor! : undefined },
        },
      });
      if (generation !== this.generation || !data) return;
      for (const message of data.items) this.upsert(message);
      this.nextCursor = data.nextCursor;
    } catch {
      if (generation === this.generation)
        this.error = 'Unable to load messages. Please try again';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          void this.load();
        }
      }
    }
  };
}
export type MessageStore = Messages;
export function createMessages(api: ApiClient): MessageStore {
  return new Messages(api);
}
