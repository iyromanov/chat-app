<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { Alert, Button, Spinner } from 'flowbite-svelte';
  import type { MessagesState } from '@entities/message';
  import { UserAvatar } from '@entities/user';
  import type { ReadonlyConversation } from '@entities/conversation';
  import { SendMessage } from '@features/send-message';
  import { Icon } from '@shared/ui';
  import { formatTime } from '@shared/lib';
  let {
    messages,
    conversation,
    onSend,
    onLoad,
    userId,
    onBack,
    connectionState,
  }: {
    messages: MessagesState;
    conversation: ReadonlyConversation;
    onSend: (conversationId: string, text: string) => Promise<void>;
    onLoad: (more?: boolean) => Promise<void>;
    userId: string;
    onBack: () => void;
    connectionState: string;
  } = $props();
  let scroller: HTMLDivElement;
  let nearBottom = true;
  let previousConversation = '';
  let previousLast = '';
  let showNew = $state(false);
  let loadingOlderId: string | null = null;
  let scrollGeneration = 0;

  function bottom() {
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    nearBottom = true;
    showNew = false;
  }

  function scroll() {
    nearBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    if (nearBottom) showNew = false;
  }

  async function older() {
    if (messages.pagination.loading || loadingOlderId === conversation.id)
      return;
    const id = conversation.id;
    loadingOlderId = id;
    const height = scroller.scrollHeight;
    const top = scroller.scrollTop;
    try {
      await onLoad(true);
      await tick();
      if (conversation.id === id)
        scroller.scrollTop = top + scroller.scrollHeight - height;
    } finally {
      if (loadingOlderId === id) loadingOlderId = null;
    }
  }

  $effect(() => {
    const id = conversation.id;
    const last = messages.items.at(-1);
    const loading = messages.pagination.loading;
    untrack(() => {
      const generation = ++scrollGeneration;
      if (previousConversation !== id) {
        previousConversation = id;
        previousLast = '';
        nearBottom = true;
        showNew = false;
      }
      const changed = !!last && last.id !== previousLast;
      const shouldScroll =
        loadingOlderId !== id &&
        (nearBottom || (changed && last.senderId === userId));
      previousLast = last?.id ?? '';
      if (changed && !shouldScroll) showNew = true;
      if (shouldScroll)
        tick().then(() => {
          if (generation === scrollGeneration && !loading) bottom();
        });
    });
  });

  function observeSize(element: Element) {
    const observer = new ResizeObserver(() => {
      if (nearBottom && loadingOlderId !== conversation.id) bottom();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }
</script>

<header
  class="flex h-[60px] shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 md:px-5"
>
  <Button
    color="alternative"
    aria-label="Back"
    onclick={onBack}
    class="h-9 w-9 rounded-full border-0 p-0 shadow-none md:hidden"
    ><Icon name="back" /></Button
  >
  <UserAvatar username={conversation.counterpart.username} />
  <h2 class="min-w-0 truncate text-sm font-semibold text-gray-900">
    {conversation.counterpart.username}
  </h2>
  <p role="status" aria-live="polite" class="ml-auto text-xs text-gray-500">
    {connectionState}
  </p>
</header>
<div class="relative min-h-0 flex-1">
  <div
    bind:this={scroller}
    onscroll={scroll}
    {@attach observeSize}
    class="h-full overflow-y-auto overscroll-contain px-4 py-5 md:px-8"
    aria-label="Messages"
  >
    {#if messages.pagination.nextCursor}<div class="mb-4 text-center">
        <Button
          color="alternative"
          size="xs"
          disabled={messages.pagination.loading}
          onclick={older}>Load older messages</Button
        >
      </div>{/if}
    {#if messages.pagination.loading}<div
        role="status"
        class="flex justify-center gap-2 p-3 text-sm text-gray-500"
      >
        <Spinner size="4" />Loading messages…
      </div>{/if}
    {#if messages.pagination.error}<div class="mx-auto mb-4 max-w-md space-y-2">
        <Alert color="red" role="alert">{messages.pagination.error}</Alert
        ><Button
          size="sm"
          onclick={() =>
            messages.pagination.failedMode === 'next' ? older() : onLoad()}
          >Try again</Button
        >
      </div>{/if}
    <ol class="flex flex-col gap-2" aria-label="Message history">
      {#each messages.items as message (message.id)}
        <li
          class={[
            'flex',
            message.senderId === userId ? 'justify-end' : 'justify-start',
          ]}
        >
          <div
            class={[
              'max-w-[85%] rounded-xl px-3 py-2 shadow-sm md:max-w-[70%]',
              message.senderId === userId
                ? 'rounded-tr-sm bg-blue-100'
                : 'rounded-tl-sm bg-white',
            ]}
          >
            <p
              class="whitespace-pre-wrap text-sm leading-6 text-gray-900 [overflow-wrap:anywhere]"
            >
              {message.text}
            </p>
            <time
              class="mt-1 block text-right text-[10px] leading-4 text-gray-500"
              datetime={message.createdAt}
              title={new Date(message.createdAt).toLocaleString()}
              >{formatTime(message.createdAt)}</time
            >
          </div>
        </li>
      {/each}
    </ol>
    {#if !messages.pagination.loading && !messages.pagination.error && messages.items.length === 0}<p
        class="py-12 text-center text-sm text-gray-500"
      >
        No messages yet. Send the first message.
      </p>{/if}
  </div>
  {#if showNew}<div class="absolute bottom-4 left-1/2 -translate-x-1/2">
      <Button pill size="sm" onclick={bottom}>New messages ↓</Button>
    </div>{/if}
</div>
{#key conversation.id}
  <SendMessage {onSend} conversationId={conversation.id} />
{/key}
