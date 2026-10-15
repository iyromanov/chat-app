import { createRandomId } from '@shared/lib';
import { sendMessageSchema, type Message } from '@chat/contracts';
import { ApiError, type ApiClient } from '@shared/api';

type Draft = {
  text: string;
  sending: boolean;
  error: string;
  attempt?: { text: string; attemptId: string };
};

class MessageComposer {
  drafts = $state<Record<string, Draft>>({});

  private disposed = false;

  constructor(
    private readonly api: () => ApiClient,
    private readonly onSent: (message: Message) => void,
  ) {}

  open = (id: string) => {
    this.drafts[id] ??= { text: '', sending: false, error: '' };
  };

  dispose = () => {
    this.disposed = true;
    this.drafts = {};
  };

  send = async (conversationId: string) => {
    const draft = this.drafts[conversationId];
    if (!draft || draft.sending || this.disposed) return;
    const parsed = sendMessageSchema.safeParse({
      text: draft.text,
      attemptId: createRandomId(),
    });
    if (!parsed.success) {
      draft.error = parsed.error.issues[0].message;
      return;
    }
    if (draft.attempt?.text !== parsed.data.text) draft.attempt = parsed.data;
    const attempt = draft.attempt;
    draft.sending = true;
    draft.error = '';
    try {
      const { data } = await this.api().MessagesController_send({
        params: { path: { conversationId } },
        body: attempt,
      });
      if (!data) throw new Error('Missing saved message');
      if (this.disposed) return;
      this.onSent(data);
      if (draft.text.trim() === attempt.text) draft.text = '';
      draft.attempt = undefined;
    } catch (cause) {
      if (this.disposed) return;
      draft.error =
        cause instanceof ApiError
          ? cause.body.message
          : 'Unable to confirm sending. Retry with the same text to avoid duplicates';
    } finally {
      draft.sending = false;
    }
  };
}

export type MessageComposerStore = MessageComposer;

export function createMessageComposer(
  api: () => ApiClient,
  onSent: (message: Message) => void,
) {
  return new MessageComposer(api, onSent);
}
