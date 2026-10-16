<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { Alert, Button, Textarea } from 'flowbite-svelte';
  import { sendMessageSchema } from '@chat/contracts/messages';
  import { ApiError } from '@shared/api';
  import { Icon } from '@shared/ui';
  let {
    onSend,
    conversationId,
  }: {
    onSend: (conversationId: string, text: string) => Promise<void>;
    conversationId: string;
  } = $props();
  let text = $state('');
  let sending = $state(false);
  let error = $state('');
  let disposed = false;
  onDestroy(() => {
    disposed = true;
  });

  async function send() {
    if (sending || disposed) return;
    const parsed = sendMessageSchema.safeParse({ text });
    if (!parsed.success) {
      error = parsed.error.issues[0].message;
      return;
    }
    const id = conversationId;
    const sentText = text;
    sending = true;
    error = '';
    try {
      await onSend(id, parsed.data.text);
      if (!disposed && conversationId === id && text === sentText) text = '';
    } catch (cause) {
      if (!disposed && conversationId === id)
        error =
          cause instanceof ApiError
            ? cause.body.message
            : 'Unable to send message. Please try again';
    } finally {
      if (!disposed && conversationId === id) sending = false;
    }
  }

  function resize(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }

  let textarea = $state<HTMLTextAreaElement>();
  $effect(() => {
    const value = text;
    const element = textarea;
    if (element)
      tick().then(() => {
        if (element.value === value) resize(element);
      });
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    send();
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  }
</script>

<form
  onsubmit={submit}
  class="composer shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-3 md:px-5"
>
  {#if error}<Alert color="red" role="alert" class="mb-3">{error}</Alert>{/if}
  <div class="flex items-end gap-3">
    <Textarea
      id="message-text"
      bind:elementRef={textarea}
      aria-label="Message"
      bind:value={text}
      rows={1}
      placeholder="Write a message"
      disabled={sending}
      onkeydown={keydown}
      oninput={(event) => resize(event.currentTarget)}
      classes={{ div: 'min-w-0 flex-1' }}
      class="block w-full max-h-40 min-h-11 resize-none rounded-2xl border-gray-200 bg-white px-4 py-3 text-base leading-5 sm:text-sm focus:border-blue-500 focus:ring-blue-500"
    />
    <Button
      type="submit"
      pill
      aria-label={sending ? 'Sending message' : 'Send message'}
      disabled={sending || !text.trim()}
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
