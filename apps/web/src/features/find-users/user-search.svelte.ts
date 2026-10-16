import type { PublicUser, UsersPage } from '@chat/contracts/users';

class UserSearch {
  private generation = 0;

  search = $state('');

  items = $state.raw<PublicUser[]>([]);

  nextCursor = $state<string | null>(null);

  loading = $state(false);

  error = $state('');

  constructor(
    private readonly searchUsers: (
      search: string,
      cursor?: string,
    ) => Promise<UsersPage>,
  ) {}

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
      const data = await this.searchUsers(
        this.search,
        more ? this.nextCursor! : undefined,
      );
      if (generation !== this.generation) return;
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

export function createUserSearch(
  searchUsers: (search: string, cursor?: string) => Promise<UsersPage>,
) {
  return new UserSearch(searchUsers);
}
