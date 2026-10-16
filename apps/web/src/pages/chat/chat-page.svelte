<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Alert, Button, Input, Spinner } from 'flowbite-svelte';
  import type { Conversation } from '@chat/contracts/conversations';
  import type { UsersPage } from '@chat/contracts/users';
  import { Icon, InfiniteScroll } from '@shared/ui';
  import { MessageHistory } from '@widgets/message-history';
  import type { MessagesState } from '@entities/message';
  import { ConversationsWidget } from '@widgets/conversations';
  import type {
    ConversationsState,
    ReadonlyConversation,
  } from '@entities/conversation';
  import { createUserSearch } from '@features/find-users';
  import { StartConversation } from '@features/start-conversation';
  let {
    conversations,
    messages,
    userId,
    onSend,
    onOpen,
    onLoadMessages,
    onLoadConversations,
    onSearch,
    onStart,
    onLogout,
    connectionState,
  }: {
    conversations: ConversationsState;
    messages: MessagesState;
    userId: string;
    onSend: (conversationId: string, text: string) => Promise<void>;
    onOpen: (conversationId: string) => Promise<void>;
    onLoadMessages: (more?: boolean) => Promise<void>;
    onLoadConversations: (more?: boolean) => Promise<void>;
    onSearch: (search: string, cursor?: string) => Promise<UsersPage>;
    onStart: (userId: string) => Promise<Conversation | null>;
    onLogout: () => Promise<void>;
    connectionState: string;
  } = $props();
  const users = createUserSearch((search, cursor) => onSearch(search, cursor));
  let selectedConversation = $state.raw<ReadonlyConversation | null>(null);
  let selectedId = $derived(selectedConversation?.id ?? null);
  let selected = $derived(
    conversations.items.find((item) => item.id === selectedId) ??
      selectedConversation,
  );
  let view = $state<'list' | 'search' | 'chat'>('list');
  let searchActive = $state(false);
  let menuOpen = $state(false);
  let signingOut = $state(false);
  let logoutError = $state('');
  let menuElement: HTMLDivElement;
  let searchInput = $state<HTMLInputElement>();
  let viewportHeight = $state<number>();
  let viewportTop = $state(0);

  function select(id: string) {
    const conversation = conversations.items.find((item) => item.id === id);
    if (!conversation) return;
    selectedConversation = conversation;
    onOpen(id);
    view = 'chat';
  }

  async function start(userId: string) {
    const conversation = await onStart(userId);
    if (!conversation) return;
    selectedConversation = conversation;
    view = 'chat';
  }

  function openSearch() {
    searchActive = true;
    view = 'search';
    menuOpen = false;
    if (!users.items.length && !users.loading) users.load();
    tick().then(() => searchInput?.focus());
  }

  function closeSearch() {
    searchActive = false;
    users.change('');
    view = 'list';
    searchInput?.blur();
  }

  function back() {
    view = searchActive ? 'search' : 'list';
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (menuOpen) menuOpen = false;
    else if (searchActive && view !== 'chat') closeSearch();
  }

  function outside(event: MouseEvent) {
    if (menuOpen && !menuElement?.contains(event.target as Node))
      menuOpen = false;
  }

  async function logout() {
    if (signingOut) return;
    signingOut = true;
    logoutError = '';
    try {
      await onLogout();
    } catch {
      logoutError = 'Unable to sign out. Please try again';
    } finally {
      signingOut = false;
      menuOpen = false;
    }
  }

  onMount(() => {
    const media = window.matchMedia('(min-width: 768px)');

    const changed = () => {
      if (!media.matches && selectedId) view = 'chat';
    };

    media.addEventListener('change', changed);
    const viewport = window.visualViewport;

    const resize = () => {
      viewportHeight = viewport?.height ?? window.innerHeight;
      viewportTop = viewport?.offsetTop ?? 0;
    };

    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => {
      users.dispose();
      media.removeEventListener('change', changed);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<svelte:window onkeydown={keyboard} onclick={outside} />

<div
  class="chat-shell fixed inset-x-0 flex overflow-hidden bg-white text-gray-900"
  style:height={viewportHeight ? `${viewportHeight}px` : '100dvh'}
  style:top={`${viewportTop}px`}
>
  <aside
    aria-label="Sidebar"
    class={[
      'h-full min-h-0 w-full shrink-0 flex-col border-r border-gray-200 bg-white md:flex md:w-80',
      view === 'chat' ? 'hidden' : 'flex',
    ]}
  >
    <header
      class={[
        'h-14 shrink-0 items-center justify-between px-4',
        view === 'search' ? 'hidden md:flex' : 'flex',
      ]}
    >
      <h1 class="text-xl font-semibold tracking-tight">
        <span class="hidden md:inline"
          >Chat<span class="text-blue-600">.</span></span
        ><span class="md:hidden">Chats</span>
      </h1>
      <div class="flex items-center gap-1">
        <Button
          color="alternative"
          aria-label="Search users"
          onclick={openSearch}
          class="h-9 w-9 rounded-full border-0 p-0 shadow-none md:hidden"
          ><Icon name="search" /></Button
        >
        <Button
          color="alternative"
          size="xs"
          onclick={logout}
          disabled={signingOut}
          class="hidden gap-2 rounded-lg border-0 text-gray-500 shadow-none md:flex"
          ><Icon name="logout" size={16} />Sign out</Button
        >
        <div bind:this={menuElement} class="relative md:hidden">
          <Button
            color="alternative"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="account-menu"
            onclick={() => (menuOpen = !menuOpen)}
            class="h-9 w-9 rounded-full border-0 p-0 shadow-none"
            ><Icon name="menu" /></Button
          >
          {#if menuOpen}<div
              id="account-menu"
              class="absolute right-0 top-11 z-20 w-36 rounded-xl border border-gray-100 bg-white p-1 shadow-lg"
            >
              <Button
                color="alternative"
                onclick={logout}
                disabled={signingOut}
                class="w-full justify-start gap-2 border-0 shadow-none"
                ><Icon name="logout" size={16} />Sign out</Button
              >
            </div>{/if}
        </div>
      </div>
    </header>
    <p
      role="status"
      aria-live="polite"
      class="shrink-0 px-4 pb-2 text-xs text-gray-500"
    >
      {connectionState}
    </p>
    {#if logoutError}<div class="shrink-0 px-3 pb-2">
        <Alert color="red" role="alert">{logoutError}</Alert>
      </div>{/if}
    <div
      class={[
        'shrink-0 items-center gap-2 px-3 pb-3 pt-2 md:flex',
        view === 'search' ? 'flex' : 'hidden',
      ]}
    >
      <Button
        color="alternative"
        aria-label="Back to chats"
        onclick={closeSearch}
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
            if (!searchActive) openSearch();
          }}
          oninput={(event) =>
            users.change((event.currentTarget as HTMLInputElement).value)}
          placeholder="Search users"
          class="rounded-xl border-0 bg-gray-100 py-2.5 pl-10 pr-9 text-base sm:text-sm focus:ring-blue-500"
        />
        {#if searchActive}<Button
            color="alternative"
            aria-label="Close search"
            onclick={closeSearch}
            class="absolute right-1 top-1 h-8 w-8 rounded-full border-0 bg-transparent p-0 shadow-none"
            ><Icon name="close" size={16} /></Button
          >{/if}
      </div>
    </div>
    <div class={['min-h-0 flex-1', searchActive ? 'hidden' : 'block']}>
      <ConversationsWidget
        {conversations}
        {selectedId}
        onSelect={select}
        onLoad={onLoadConversations}
      />
    </div>
    <section
      aria-label="Search results"
      class={['min-h-0 flex-1 flex-col', searchActive ? 'flex' : 'hidden']}
    >
      <h2
        class="shrink-0 px-5 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
      >
        {users.search ? 'Search results' : 'People'}
      </h2>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {#each users.items as user (user.id)}<StartConversation
            onStart={start}
            userId={user.id}
            username={user.username}
          />{/each}
        {#if users.loading}<div
            role="status"
            class="flex items-center justify-center gap-2 p-5 text-sm text-gray-500"
          >
            <Spinner size="4" />Loading users…
          </div>
        {:else if users.error}<div class="space-y-3 p-4">
            <Alert color="red" role="alert">{users.error}</Alert><Button
              size="sm"
              onclick={() => users.load(!!users.nextCursor)}>Try again</Button
            >
          </div>
        {:else if users.items.length === 0}<p
            class="px-5 py-12 text-center text-sm text-gray-500"
          >
            {users.search ? 'No users found' : 'No other users yet'}
          </p>
        {:else if users.nextCursor}<InfiniteScroll
            onLoad={() => users.load(true)}
          />{/if}
      </div>
    </section>
  </aside>
  <section
    aria-label="Conversation"
    class={[
      'h-full min-h-0 min-w-0 flex-1 flex-col bg-slate-100 md:flex',
      view === 'chat' ? 'flex' : 'hidden',
    ]}
  >
    {#if selected}
      <MessageHistory
        {messages}
        onLoad={onLoadMessages}
        {connectionState}
        conversation={selected}
        {onSend}
        {userId}
        onBack={back}
      />
    {:else}
      <div
        class="flex h-full flex-col items-center justify-center px-8 text-center"
      >
        <div
          class="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 text-blue-500"
        >
          <Icon name="chat" size={44} />
        </div>
        <h2 class="text-2xl font-medium tracking-tight text-gray-800">
          Select a chat
        </h2>
        <p class="mt-3 text-sm text-gray-500">Or find a user using search</p>
      </div>
    {/if}
  </section>
</div>
