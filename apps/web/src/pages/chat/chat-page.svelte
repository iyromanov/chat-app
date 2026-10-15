<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Alert,
    Button,
    Card,
    Heading,
    Input,
    Label,
    P,
    Spinner,
  } from 'flowbite-svelte';
  import type { Conversation } from '@chat/contracts';
  import type { ApiClient } from '@shared/api';
  import { InfiniteScroll } from '@shared/ui';
  import { MessageHistory } from '@widgets/message-history';
  import type { MessageStore } from '@entities/message';
  import type { Message } from '@chat/contracts';
  import { ConversationsWidget } from '@widgets/conversations';
  import type { ConversationStore } from '@entities/conversation';
  import { createUserSearch } from '@features/find-users';
  import { StartConversation } from '@features/start-conversation';
  let {
    api,
    conversations,
    messages,
    userId,
    onSent,
  }: {
    api: ApiClient;
    conversations: ConversationStore;
    messages: MessageStore;
    userId: string;
    onSent: (message: Message) => void;
  } = $props();
  const users = createUserSearch(() => api);
  let selectedId = $state<string | null>(null);
  function started(conversation: Conversation) {
    conversations.upsert(conversation);
    select(conversation.id);
  }
  let selected = $derived(
    conversations.items.find((item) => item.id === selectedId),
  );
  function select(id: string) {
    selectedId = id;
    messages.open(id);
  }
  onMount(() => {
    void users.load();
    return users.dispose;
  });
</script>

<div class="grid gap-6 md:grid-cols-2">
  <section class="flex min-w-0 flex-col gap-4" aria-label="Find users">
    <Heading tag="h2">Find users</Heading>
    <Label for="user-search">Search by username</Label>
    <Input
      id="user-search"
      value={users.search}
      oninput={(event) =>
        users.change((event.currentTarget as HTMLInputElement).value)}
      placeholder="Search users"
    />
    {#each users.items as user (user.id)}
      <Card size="xl"
        ><div class="flex flex-wrap items-center justify-between gap-3">
          <P>{user.username}</P><StartConversation
            {api}
            userId={user.id}
            onStarted={started}
          />
        </div></Card
      >
    {/each}
    {#if users.loading}<div role="status" class="flex items-center gap-2">
        <Spinner size="4" /><P>Loading users…</P>
      </div>
    {:else if users.error}<Alert color="red" role="alert">{users.error}</Alert
      ><Button onclick={() => users.load(!!users.nextCursor)}>Try again</Button>
    {:else if users.items.length === 0}<P
        >{users.search ? 'No users found' : 'No other users yet'}</P
      >
    {:else if users.nextCursor}<InfiniteScroll
        onLoad={() => void users.load(true)}
      />{/if}
  </section>
  <section class="flex min-w-0 flex-col gap-6">
    <ConversationsWidget {conversations} {selectedId} onSelect={select} />
    {#if selected}<MessageHistory
        {messages}
        conversation={selected}
        {api}
        {onSent}
        {userId}
      />{/if}
  </section>
</div>
