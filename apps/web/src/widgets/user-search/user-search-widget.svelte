<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { Alert, Button, Input, Spinner } from 'flowbite-svelte';
  import type { UsersPage } from '@chat/contracts/users';
  import { createUserSearch } from '@features/find-users';
  import { StartConversation } from '@features/start-conversation';
  import { Icon, InfiniteScroll } from '@shared/ui';

  let {
    active,
    onActivate,
    onClose,
    onSearch,
    onStart,
  }: {
    active: boolean;
    onActivate: () => void;
    onClose: () => void;
    onSearch: (search: string, cursor?: string) => Promise<UsersPage>;
    onStart: (userId: string) => Promise<void>;
  } = $props();

  const users = createUserSearch((search, cursor) => onSearch(search, cursor));
  let searchInput = $state<HTMLInputElement>();
  let previousActive = false;

  $effect(() => {
    if (active === previousActive) return;
    previousActive = active;
    untrack(() => {
      if (active) {
        if (!users.items.length && !users.pagination.loading) users.load();
        tick().then(() => {
          if (active) searchInput?.focus();
        });
      } else {
        users.change('');
        searchInput?.blur();
      }
    });
  });

  onDestroy(users.dispose);
</script>

<div
  class={[
    'shrink-0 items-center gap-2 px-3 pb-3 pt-2 md:flex',
    active ? 'flex' : 'hidden',
  ]}
>
  <Button
    color="alternative"
    aria-label="Back to chats"
    onclick={onClose}
    class="h-9 w-9 shrink-0 rounded-full border-0 p-0 shadow-none md:hidden"
    ><Icon name="back" /></Button
  >
  <div class="relative min-w-0 flex-1">
    <span
      class="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center text-gray-400"
      ><Icon name="search" size={17} /></span
    >
    <Input
      id="user-search"
      aria-label="Search users"
      bind:elementRef={searchInput}
      value={users.search}
      onfocus={() => {
        if (!active) onActivate();
      }}
      oninput={(event) =>
        users.change((event.currentTarget as HTMLInputElement).value)}
      placeholder="Search users"
      class="rounded-xl border-0 bg-gray-100 py-2.5 pl-10 pr-9 text-base sm:text-sm focus:ring-blue-500"
    />
    {#if active}<Button
        color="alternative"
        aria-label="Close search"
        onclick={onClose}
        class="absolute right-1 top-1 h-8 w-8 rounded-full border-0 bg-transparent p-0 shadow-none"
        ><Icon name="close" size={16} /></Button
      >{/if}
  </div>
</div>
<section
  aria-label="Search results"
  class={['min-h-0 flex-1 flex-col', active ? 'flex' : 'hidden']}
>
  <h2
    class="shrink-0 px-5 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
  >
    {users.search ? 'Search results' : 'People'}
  </h2>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {#each users.items as user (user.id)}<StartConversation
        {onStart}
        userId={user.id}
        username={user.username}
      />{/each}
    {#if users.pagination.loading}<div
        role="status"
        class="flex items-center justify-center gap-2 p-5 text-sm text-gray-500"
      >
        <Spinner size="4" />Loading users…
      </div>
    {:else if users.pagination.error}<div class="space-y-3 p-4">
        <Alert color="red" role="alert">{users.pagination.error}</Alert><Button
          size="sm"
          onclick={() => users.load(users.pagination.failedMode === 'next')}
          >Try again</Button
        >
      </div>
    {:else if users.items.length === 0}<p
        class="px-5 py-12 text-center text-sm text-gray-500"
      >
        {users.search ? 'No users found' : 'No other users yet'}
      </p>
    {:else if users.pagination.nextCursor}<InfiniteScroll
        onLoad={() => users.load(true)}
      />{/if}
  </div>
</section>
