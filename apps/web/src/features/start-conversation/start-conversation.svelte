<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Alert, Button } from 'flowbite-svelte';
  import type { Conversation } from '@chat/contracts';
  import { UserAvatar } from '@entities/user';
  import { Icon } from '@shared/ui';
  import { ApiError, type ApiClient } from '@shared/api';
  let {
    api,
    userId,
    username,
    onStarted,
  }: {
    api: ApiClient;
    userId: string;
    username: string;
    onStarted: (conversation: Conversation) => void;
  } = $props();
  let active = true;
  onDestroy(() => {
    active = false;
  });
  let loading = $state(false);
  let error = $state('');

  async function start() {
    if (loading) return;
    loading = true;
    error = '';
    try {
      const { data } = await api.ConversationsController_start({
        body: { userId },
      });
      if (data && active) onStarted(data);
    } catch (reason) {
      if (active)
        error =
          reason instanceof ApiError
            ? reason.message
            : 'Unable to start conversation. Please try again';
    } finally {
      loading = false;
    }
  }
</script>

<Button
  color="alternative"
  onclick={start}
  disabled={loading}
  aria-label={`Start conversation with ${username}`}
  class="w-full justify-start gap-3 rounded-none border-0 bg-white px-4 py-3 text-left shadow-none hover:bg-blue-50 focus-visible:ring-inset"
>
  <UserAvatar {username} />
  <span class="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900"
    >{username}</span
  >
  <span class="text-blue-600"><Icon name="chat" size={18} /></span>
</Button>
{#if error}<div class="px-4 pb-3">
    <Alert color="red" role="alert">{error}</Alert>
  </div>{/if}
