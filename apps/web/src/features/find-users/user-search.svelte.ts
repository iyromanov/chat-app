import type { PublicUser } from '@chat/contracts';
import type { ApiClient } from '@shared/api';

class UserSearch {
  search = $state('');
  items = $state.raw<PublicUser[]>([]);
  nextCursor = $state<string | null>(null);
  loading = $state(false);
  error = $state('');

  private generation = 0;

  constructor(private readonly api: () => ApiClient) {}

  change = (search: string) => {
    this.generation++;
    this.search = search;
    this.items = [];
    this.nextCursor = null;
    this.loading = false;
    void this.load();
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
      const { data } = await this.api().UsersController_list({
        params: {
          query: {
            search: this.search,
            cursor: more ? this.nextCursor! : undefined,
          },
        },
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
