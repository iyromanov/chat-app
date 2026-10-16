<script lang="ts">
  import { onMount } from 'svelte';
  import type { Conversation } from '@chat/contracts/conversations';
  import type { UsersPage } from '@chat/contracts/users';
  import { Icon } from '@shared/ui';
  import { MessageHistory } from '@widgets/message-history';
  import type { MessagesState } from '@entities/message';
  import { ConversationsWidget } from '@widgets/conversations';
  import type {
    ConversationsState,
    ReadonlyConversation,
  } from '@entities/conversation';
  import { UserSearchWidget } from '@widgets/user-search';
  import ChatSidebarHeader from './ui/chat-sidebar-header.svelte';
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
    onStart: (userId: string) => Promise<Conversation>;
    onLogout: () => Promise<void>;
    connectionState: string;
  } = $props();
  let selectedConversation = $state.raw<ReadonlyConversation | null>(null);
  let selectedId = $derived(selectedConversation?.id ?? null);
  let selected = $derived(
    conversations.items.find((item) => item.id === selectedId) ??
      selectedConversation,
  );
  let view = $state<'list' | 'search' | 'chat'>('list');
  let searchActive = $state(false);
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
    selectedConversation = conversation;
    view = 'chat';
  }

  function openSearch() {
    searchActive = true;
    view = 'search';
  }

  function closeSearch() {
    searchActive = false;
    view = 'list';
  }

  function back() {
    view = searchActive ? 'search' : 'list';
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (searchActive && view !== 'chat') closeSearch();
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
      media.removeEventListener('change', changed);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<svelte:window onkeydown={keyboard} />

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
    <ChatSidebarHeader
      mobileSearch={view === 'search'}
      {connectionState}
      onSearch={openSearch}
      {onLogout}
    />
    <UserSearchWidget
      active={searchActive}
      onActivate={openSearch}
      onClose={closeSearch}
      {onSearch}
      onStart={start}
    />
    <div class={['min-h-0 flex-1', searchActive ? 'hidden' : 'block']}>
      <ConversationsWidget
        {conversations}
        {selectedId}
        onSelect={select}
        onLoad={onLoadConversations}
      />
    </div>
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
