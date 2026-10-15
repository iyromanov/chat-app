import type { Message } from '@chat/contracts/messages';
import type { ApiClient } from '@shared/api';

class Messages {
  private generation = 0;
  private refreshPending = false;
  private initialized = false;
  private synchronizedId: string | null = null;

  conversationId = $state<string | null>(null);
  items = $state.raw<Message[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  error = $state('');
  failedLoadMore = $state(false);

  constructor(
    private readonly api: ApiClient,
    private readonly onLoaded: (message: Message) => void,
  ) {}

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
    this.load();
  };

  clear = () => {
    this.generation++;
    this.conversationId = null;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    this.error = '';
    this.failedLoadMore = false;
    this.refreshPending = false;
    this.initialized = false;
    this.synchronizedId = null;
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
      const recovering = !more && this.initialized;
      const after = recovering ? (this.synchronizedId ?? 'start') : undefined;
      let cursor = more ? this.nextCursor : null;
      let synchronizedId = this.synchronizedId;
      do {
        const { data } = await this.api.messages.list(conversationId, {
          cursor: cursor ?? undefined,
          after,
        });
        if (generation !== this.generation || !data) return;
        for (const message of data.items) {
          this.upsert(message);
          this.onLoaded(message);
        }
        if (!recovering) this.nextCursor = data.nextCursor;
        if (!more) synchronizedId = data.items.at(-1)?.id ?? synchronizedId;
        cursor = data.nextCursor;
      } while (recovering && cursor);
      if (!more) {
        this.synchronizedId = synchronizedId;
        this.initialized = true;
      }
    } catch {
      if (generation === this.generation) {
        this.failedLoadMore = more;
        this.error = 'Unable to load messages. Please try again';
      }
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        if (this.refreshPending) {
          this.refreshPending = false;
          this.load();
        }
      }
    }
  };
}
export type MessageStore = Messages;

export function createMessages(
  api: ApiClient,
  onLoaded: (message: Message) => void,
): MessageStore {
  return new Messages(api, onLoaded);
}
