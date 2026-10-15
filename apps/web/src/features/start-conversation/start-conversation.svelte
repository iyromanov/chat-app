<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Alert, Button } from 'flowbite-svelte';
  import type { Conversation } from '@chat/contracts';
  import { ApiError, type ApiClient } from '@shared/api';
  let {
    api,
    userId,
    onStarted,
  }: {
    api: ApiClient;
    userId: string;
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
      error =
        reason instanceof ApiError
          ? reason.message
          : 'Unable to start conversation. Please try again';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex flex-col gap-2">
  <Button size="sm" onclick={start} disabled={loading}
    >{loading ? 'Starting…' : 'Start conversation'}</Button
  >
  {#if error}<Alert color="red" role="alert">{error}</Alert>{/if}
</div>
