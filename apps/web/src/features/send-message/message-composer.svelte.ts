import { createRandomId } from '@shared/lib';
import {
  sendMessageSchema,
  type Message,
  type SendMessage,
} from '@chat/contracts/messages';
import { ApiError, type ApiClient } from '@shared/api';

type Draft = {
  text: string;
  sending: boolean;
  error: string;
  status: 'idle' | 'sending' | 'uncertain' | 'confirmed' | 'rejected';
  attempt?: Readonly<SendMessage>;
};

class MessageComposer {
  private disposed = false;

  drafts = $state<Record<string, Draft>>({});

  constructor(
    private readonly api: () => ApiClient,
    private readonly onSent: (message: Message) => void,
    private readonly userId: string,
  ) {}

  open = (id: string) => {
    this.drafts[id] ??= { text: '', sending: false, error: '', status: 'idle' };
  };

  dispose = () => {
    this.disposed = true;
    this.drafts = {};
  };

  confirm = (message: Message) => {
    if (this.disposed || message.senderId !== this.userId) return;
    const draft = this.drafts[message.conversationId];
    const attempt = draft?.attempt;
    if (!attempt || attempt.attemptId !== message.attemptId) return;
    if (draft.text.trim() === attempt.text) draft.text = '';
    draft.attempt = undefined;
    draft.status = 'confirmed';
    draft.error = '';
  };

  send = async (conversationId: string) => {
    const draft = this.drafts[conversationId];
    if (!draft || draft.sending || draft.attempt || this.disposed) return;
    const parsed = sendMessageSchema.safeParse({
      text: draft.text,
      attemptId: createRandomId(),
    });
    if (!parsed.success) {
      draft.error = parsed.error.issues[0].message;
      return;
    }
    draft.attempt = Object.freeze(parsed.data);
    await this.retry(conversationId);
  };

  retry = async (conversationId: string) => {
    const draft = this.drafts[conversationId];
    const attempt = draft?.attempt;
    if (!attempt || draft.sending || this.disposed) return;
    draft.sending = true;
    draft.status = 'sending';
    draft.error = '';
    try {
      const { data } = await this.api().messages.send(conversationId, attempt);
      if (!data) throw new Error('Missing saved message');
      if (this.disposed) return;
      this.onSent(data);
      this.confirm(data);
    } catch (cause) {
      if (this.disposed || draft.attempt !== attempt) return;
      if (
        cause instanceof ApiError &&
        cause.status < 500 &&
        cause.status !== 408
      ) {
        draft.status = 'rejected';
        draft.attempt = undefined;
        draft.error = cause.body.message;
      } else {
        draft.status = 'uncertain';
        draft.error =
          'Sending is unconfirmed. Retry the original message safely';
      }
    } finally {
      draft.sending = false;
    }
  };
}

export type MessageComposerStore = MessageComposer;

export function createMessageComposer(
  api: () => ApiClient,
  onSent: (message: Message) => void,
  userId: string,
) {
  return new MessageComposer(api, onSent, userId);
}
