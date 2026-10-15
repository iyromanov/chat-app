import type { Conversation } from '@chat/contracts';
import type { ApiClient } from '@shared/api';
class Conversations {
  items = $state.raw<Conversation[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  error = $state('');
  private generation = 0;
  private refreshPending = false;
  constructor(private readonly api: ApiClient) {}
  upsert = (conversation: Conversation) => {
    this.items = [
      ...this.items.filter((item) => item.id !== conversation.id),
      conversation,
    ].sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  };
  clear = () => {
    this.generation++;
    this.refreshPending = false;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    this.error = '';
  };
  load = async (more = false) => {
    if (this.loading) {
      if (!more) this.refreshPending = true;
      return;
    }
    if (more && !this.nextCursor) return;
    const generation = this.generation;
    this.loading = true;
    this.error = '';
    try {
      const { data } = await this.api.ConversationsController_list({
        params: { query: { cursor: more ? this.nextCursor! : undefined } },
      });
      if (generation !== this.generation || !data) return;
      for (const item of data.items) this.upsert(item);
      this.nextCursor = data.nextCursor;
    } catch {
      if (generation === this.generation)
        this.error = 'Unable to load conversations. Please try again';
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
export type ConversationStore = Conversations;
export function createConversations(api: ApiClient) {
  return new Conversations(api);
}
