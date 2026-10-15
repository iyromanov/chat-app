import { Inject, Injectable } from '@nestjs/common';
import type {
  SendMessage,
  MessagesPage,
  Message,
} from '@chat/contracts/messages';
import { CONFIG, type Config } from '../common/config';
import { paginate } from '../common/pagination';
import { ConversationsService } from '../conversations/conversations.service';
import { UserSocketsService } from '../realtime/user-sockets.service';
import { MessagesRepository } from './messages.repository';
@Injectable()
export class MessagesService {
  constructor(
    private readonly sockets: UserSocketsService,
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}
  async send(
    userId: string,
    conversationId: string,
    input: SendMessage,
  ): Promise<Message> {
    const conversation = await this.conversations.getForParticipant(
      conversationId,
      userId,
    );
    const message = await this.messages.create(conversationId, userId, input);
    for (const participant of conversation.participants)
      this.sockets.emitToUser(participant, 'message:created', message);
    return message;
  }
  async list(
    userId: string,
    conversationId: string,
    cursor?: string,
  ): Promise<MessagesPage> {
    await this.conversations.getForParticipant(conversationId, userId);
    const page = await paginate({
      cursor,
      scope: `messages:${userId}:${conversationId}`,
      secret: this.config.JWT_SECRET,
      load: ({ limit, after }) =>
        this.messages.list(conversationId, limit, after),
      position: (row) => ({ key: row.createdAt, id: row.id }),
    });
    return { ...page, items: page.items.reverse() };
  }
}
