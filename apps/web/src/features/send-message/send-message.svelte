<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Alert, Button, Label, Textarea } from 'flowbite-svelte';
  import { sendMessageSchema, type Message } from '@chat/contracts';
  import { ApiError, type ApiClient } from '@shared/api';
  let {
    api,
    conversationId,
    onSent,
  }: {
    api: ApiClient;
    conversationId: string;
    onSent: (message: Message) => void;
  } = $props();
  let disposed = false;
  onDestroy(() => {
    disposed = true;
  });
  let draft = $state('');
  let sending = $state(false);
  let error = $state('');
  let attempt:
    { conversationId: string; text: string; attemptId: string } | undefined;
  async function send(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (sending) return;
    const parsed = sendMessageSchema.safeParse({
      text: draft,
      attemptId: globalThis.crypto.randomUUID(),
    });
    if (!parsed.success) {
      error = parsed.error.issues[0].message;
      return;
    }
    if (
      !attempt ||
      attempt.text !== parsed.data.text ||
      attempt.conversationId !== conversationId
    )
      attempt = { ...parsed.data, conversationId };
    const current = attempt;
    sending = true;
    error = '';
    try {
      const { data } = await api.MessagesController_send({
        params: { path: { conversationId: current.conversationId } },
        body: { text: current.text, attemptId: current.attemptId },
      });
      if (!data) throw new Error('Missing saved message');
      if (disposed) return;
      onSent(data);
      if (
        conversationId === current.conversationId &&
        draft.trim() === current.text
      )
        draft = '';
      attempt = undefined;
    } catch (cause) {
      if (disposed) return;
      error =
        cause instanceof ApiError
          ? cause.body.message
          : 'Unable to confirm sending. Retry with the same text to avoid duplicates';
    } finally {
      sending = false;
    }
  }
</script>

<form onsubmit={send} class="flex flex-col gap-3">
  <Label for="message-text">Message</Label>
  <Textarea
    id="message-text"
    bind:value={draft}
    rows={3}
    placeholder="Write a message"
    disabled={sending}
  />
  {#if error}<Alert color="red" role="alert">{error}</Alert>{/if}
  <Button type="submit" disabled={sending}
    >{sending ? 'Sending…' : 'Send message'}</Button
  >
</form>
