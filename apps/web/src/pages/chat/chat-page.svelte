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
  import type { ConversationStore } from '@entities/conversation';
  import { createUserSearch } from '@features/find-users';
  import { StartConversation } from '@features/start-conversation';
  let {
    api,
    conversations,
  }: { api: ApiClient; conversations: ConversationStore } = $props();
  const users = createUserSearch(() => api);
  let selectedId = $state<string | null>(null);
  let selected = $derived(
    conversations.items.find((item) => item.id === selectedId),
  );
  function started(conversation: Conversation) {
    conversations.upsert(conversation);
    selectedId = conversation.id;
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
  <section class="flex min-w-0 flex-col gap-4" aria-label="Conversations">
    <Heading tag="h2">Conversations</Heading>
    {#each conversations.items as conversation (conversation.id)}
      <Button
        color={selectedId === conversation.id ? 'primary' : 'alternative'}
        onclick={() => (selectedId = conversation.id)}
        class="justify-start text-left"
      >
        <span class="flex flex-col gap-1"
          ><span>{conversation.counterpart.username}</span><span
            >No messages</span
          ><time datetime={conversation.createdAt}
            >{new Date(conversation.createdAt).toLocaleString()}</time
          ></span
        >
      </Button>
    {/each}
    {#if conversations.loading}<div
        role="status"
        class="flex items-center gap-2"
      >
        <Spinner size="4" /><P>Loading conversations…</P>
      </div>
    {:else if conversations.error}<Alert color="red" role="alert"
        >{conversations.error}</Alert
      ><Button onclick={() => conversations.load(!!conversations.nextCursor)}
        >Try again</Button
      >
    {:else if conversations.items.length === 0}<P
        >No conversations yet. Find someone to start a conversation.</P
      >
    {:else if conversations.nextCursor}<InfiniteScroll
        onLoad={() => void conversations.load(true)}
      />{/if}
    {#if selected}<Card size="xl"
        ><Heading tag="h3">{selected.counterpart.username}</Heading><P
          >No messages</P
        ></Card
      >{/if}
  </section>
</div>
