<script lang="ts">
  import { Alert, Button, Spinner } from 'flowbite-svelte';
  import type { ConversationsView } from '@entities/conversation';
  import { UserAvatar } from '@entities/user';
  import { InfiniteScroll } from '@shared/ui';
  import { formatTime } from '@shared/lib';
  let {
    conversations,
    selectedId,
    onSelect,
    onLoad,
  }: {
    conversations: ConversationsView;
    selectedId: string | null;
    onSelect: (id: string) => void;
    onLoad: (more?: boolean) => Promise<void>;
  } = $props();
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Chats">
  <h2
    class="shrink-0 px-5 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-500"
  >
    Chats
  </h2>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    {#each conversations.items as conversation (conversation.id)}
      <Button
        color="alternative"
        onclick={() => onSelect(conversation.id)}
        aria-current={selectedId === conversation.id ? 'true' : undefined}
        class={[
          'w-full justify-start gap-3 rounded-none border-0 px-4 py-3 text-left shadow-none focus-within:ring-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
          selectedId === conversation.id
            ? 'bg-blue-50 hover:bg-blue-50'
            : 'bg-white hover:bg-gray-50',
        ]}
      >
        <UserAvatar username={conversation.counterpart.username} />
        <span class="min-w-0 flex-1 border-b border-gray-100 pb-2">
          <span class="flex items-baseline justify-between gap-2">
            <span class="truncate text-sm font-semibold text-gray-900"
              >{conversation.counterpart.username}</span
            >
            <time
              class="shrink-0 text-[11px] font-normal text-gray-500"
              datetime={conversation.lastMessage?.createdAt ??
                conversation.createdAt}
              >{formatTime(
                conversation.lastMessage?.createdAt ?? conversation.createdAt,
              )}</time
            >
          </span>
          <span class="mt-1 block truncate text-xs font-normal text-gray-500"
            >{conversation.lastMessage?.text ?? 'No messages'}</span
          >
        </span>
      </Button>
    {/each}
    {#if conversations.loading}
      <div
        role="status"
        class="flex items-center justify-center gap-2 p-5 text-sm text-gray-500"
      >
        <Spinner size="4" />Loading chats…
      </div>
    {:else if conversations.error}
      <div class="space-y-3 p-4">
        <Alert color="red" role="alert">{conversations.error}</Alert><Button
          size="sm"
          onclick={() => onLoad(conversations.failedLoadMore)}>Try again</Button
        >
      </div>
    {:else if conversations.items.length === 0}
      <div class="px-6 py-12 text-center">
        <p class="text-sm font-medium text-gray-700">No chats yet</p>
        <p class="mt-2 text-xs leading-5 text-gray-500">
          Find a user to start a conversation.
        </p>
      </div>
    {:else if conversations.nextCursor}
      <InfiniteScroll onLoad={() => onLoad(true)} />
    {/if}
  </div>
</section>
