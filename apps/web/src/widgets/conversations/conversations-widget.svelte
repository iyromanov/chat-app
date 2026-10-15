<script lang="ts">
  import { Alert, Button, Card, Heading, P, Spinner } from 'flowbite-svelte';
  import type { ConversationStore } from '@entities/conversation';
  import { InfiniteScroll } from '@shared/ui';
  let {
    conversations,
    selectedId = $bindable(null),
  }: { conversations: ConversationStore; selectedId: string | null } = $props();
  let selected = $derived(
    conversations.items.find((item) => item.id === selectedId),
  );
</script>

<section class="flex min-w-0 flex-col gap-4" aria-label="Conversations">
  <Heading tag="h2">Conversations</Heading>
  {#each conversations.items as conversation (conversation.id)}
    <Button
      color={selectedId === conversation.id ? 'primary' : 'alternative'}
      onclick={() => (selectedId = conversation.id)}
      class="justify-start text-left"
    >
      <span class="flex flex-col gap-1"
        ><span>{conversation.counterpart.username}</span><span>No messages</span
        ><time datetime={conversation.createdAt}
          >{new Date(conversation.createdAt).toLocaleString()}</time
        ></span
      >
    </Button>
  {/each}
  {#if conversations.loading}<div role="status" class="flex items-center gap-2">
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
