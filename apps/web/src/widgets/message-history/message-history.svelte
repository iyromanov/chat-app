<script lang="ts">
  import { Alert, Button, Card, Heading, P, Spinner } from 'flowbite-svelte';
  import type { MessageStore } from '@entities/message';
  import type { Conversation, Message } from '@chat/contracts';
  import type { ApiClient } from '@shared/api';
  import { SendMessage } from '@features/send-message';
  let {
    messages,
    conversation,
    api,
    onSent,
    userId,
  }: {
    messages: MessageStore;
    conversation: Conversation;
    api: ApiClient;
    onSent: (message: Message) => void;
    userId: string;
  } = $props();
</script>

<Card size="xl" class="min-w-0 gap-4">
  <Heading tag="h3">{conversation.counterpart.username}</Heading>
  {#if messages.nextCursor}<Button
      disabled={messages.loading}
      onclick={() => messages.load(true)}>Load more</Button
    >{/if}
  <ol
    class="flex max-h-96 flex-col gap-3 overflow-y-auto"
    aria-label="Message history"
  >
    {#each messages.items as message (message.id)}
      <li class="flex min-w-0 flex-col gap-1">
        <P
          >{message.senderId === userId
            ? 'You'
            : conversation.counterpart.username}</P
        >
        <p class="whitespace-pre-wrap break-words">{message.text}</p>
        <time datetime={message.createdAt}
          >{new Date(message.createdAt).toLocaleString()}</time
        >
      </li>
    {/each}
  </ol>
  {#if messages.loading}<div role="status" class="flex items-center gap-2">
      <Spinner size="4" /><P>Loading messages…</P>
    </div>
  {:else if messages.error}<Alert color="red" role="alert"
      >{messages.error}</Alert
    ><Button onclick={() => messages.load(!!messages.nextCursor)}
      >Try again</Button
    >
  {:else if messages.items.length === 0}<P
      >No messages yet. Send the first message.</P
    >{/if}
  {#key conversation.id}<SendMessage
      {api}
      conversationId={conversation.id}
      {onSent}
    />{/key}
</Card>
