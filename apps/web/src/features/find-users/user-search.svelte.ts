import type { PublicUser, UsersPage } from '@chat/contracts/users';
import { CursorPaginationStore, loadCursorPage } from '@shared/lib';

class UserSearch {
  search = $state('');

  items = $state.raw<PublicUser[]>([]);

  readonly pagination = new CursorPaginationStore();

  constructor(
    private readonly searchUsers: (
      search: string,
      cursor?: string,
    ) => Promise<UsersPage>,
  ) {}

  change = (search: string) => {
    this.search = search;
    this.items = [];
    this.pagination.reset();
    this.load();
  };

  dispose = () => {
    this.pagination.dispose();
  };

  load = async (more = false) => {
    if (this.pagination.loading) return;
    const search = this.search;
    await loadCursorPage({
      pagination: this.pagination,
      mode: more ? 'next' : 'first',
      fetchPage: (cursor) => this.searchUsers(search, cursor),
      applyPage: (page, mode) => {
        const current = mode === 'next' ? this.items : [];
        this.items = [
          ...current,
          ...page.items.filter(
            (user) => !current.some((item) => item.id === user.id),
          ),
        ];
      },
      errorMessage: 'Unable to find users. Please try again',
    });
  };
}

export function createUserSearch(
  searchUsers: (search: string, cursor?: string) => Promise<UsersPage>,
) {
  return new UserSearch(searchUsers);
}
