import type { PublicUser } from '@chat/contracts/users';
import type { ApiClient } from '@shared/api';

class UserSearch {
  private generation = 0;

  search = $state('');

  items = $state.raw<PublicUser[]>([]);

  nextCursor = $state<string | null>(null);

  loading = $state(false);

  error = $state('');

  constructor(private readonly api: () => ApiClient) {}

  change = (search: string) => {
    this.generation++;
    this.search = search;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    this.load();
  };

  dispose = () => {
    this.generation++;
  };

  load = async (more = false) => {
    if (this.loading || (more && !this.nextCursor)) return;
    const generation = this.generation;
    this.loading = true;
    this.error = '';
    try {
      const { data } = await this.api().users.list({
        search: this.search,
        cursor: more ? this.nextCursor! : undefined,
      });
      if (generation !== this.generation || !data) return;
      this.items = [
        ...this.items,
        ...data.items.filter(
          (user) => !this.items.some((item) => item.id === user.id),
        ),
      ];
      this.nextCursor = data.nextCursor;
    } catch {
      if (generation === this.generation)
        this.error = 'Unable to find users. Please try again';
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  };
}

export function createUserSearch(api: () => ApiClient) {
  return new UserSearch(api);
}
