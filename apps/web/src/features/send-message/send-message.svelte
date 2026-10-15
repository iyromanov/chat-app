<script lang="ts">
  import { tick } from 'svelte';
  import { Alert, Button, Textarea } from 'flowbite-svelte';
  import { Icon } from '@shared/ui';
  import type { MessageComposerStore } from './message-composer.svelte';
  let {
    composer,
    conversationId,
  }: { composer: MessageComposerStore; conversationId: string } = $props();
  let draft = $derived(composer.drafts[conversationId]);

  function resize(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  let textarea = $state<HTMLTextAreaElement>();
  $effect(() => {
    const text = draft.text;
    const element = textarea;
    if (element)
      tick().then(() => {
        if (element.value === text) resize(element);
      });
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    composer.send(conversationId);
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composer.send(conversationId);
    }
  }
</script>

<form
  onsubmit={submit}
  class="composer shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-3 md:px-5"
>
  {#if draft.error}<Alert color="red" role="alert" class="mb-3"
      >{draft.error}</Alert
    >{/if}
  <div class="flex items-end gap-3">
    {#key conversationId}
      <Textarea
        id="message-text"
        bind:elementRef={textarea}
        aria-label="Message"
        bind:value={draft.text}
        rows={1}
        placeholder="Write a message"
        disabled={draft.sending}
        onkeydown={keydown}
        oninput={(event) => resize(event.currentTarget)}
        classes={{ div: 'min-w-0 flex-1' }}
        class="block w-full max-h-40 min-h-11 resize-none rounded-2xl border-gray-200 bg-white px-4 py-3 text-base leading-5 sm:text-sm focus:border-blue-500 focus:ring-blue-500"
      />
    {/key}
    <Button
      type="submit"
      pill
      aria-label={draft.sending ? 'Sending message' : 'Send message'}
      disabled={draft.sending || !draft.text.trim()}
      class="h-11 w-11 shrink-0 p-0"
    >
      <Icon name="send" size={19} />
    </Button>
  </div>
</form>

<style>
  .composer {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
</style>
