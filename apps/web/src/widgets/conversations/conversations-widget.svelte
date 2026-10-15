<script lang="ts">
  import { Alert, Button, Heading, P, Spinner } from 'flowbite-svelte';
  import type { ConversationStore } from '@entities/conversation';
  import { InfiniteScroll } from '@shared/ui';
  let {
    conversations,
    selectedId,
    onSelect,
  }: {
    conversations: ConversationStore;
    selectedId: string | null;
    onSelect: (id: string) => void;
  } = $props();
</script>

<section class="flex min-w-0 flex-col gap-4" aria-label="Conversations">
  <Heading tag="h2">Conversations</Heading>
  {#each conversations.items as conversation (conversation.id)}
    <Button
      color={selectedId === conversation.id ? 'primary' : 'alternative'}
      onclick={() => onSelect(conversation.id)}
      class="min-w-0 justify-start text-left"
    >
      <span class="flex min-w-0 flex-col gap-1"
        ><span>{conversation.counterpart.username}</span><span class="truncate"
          >{conversation.lastMessage?.text ?? 'No messages'}</span
        ><time
          datetime={conversation.lastMessage?.createdAt ??
            conversation.createdAt}
          >{new Date(
            conversation.lastMessage?.createdAt ?? conversation.createdAt,
          ).toLocaleString()}</time
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
</section>
