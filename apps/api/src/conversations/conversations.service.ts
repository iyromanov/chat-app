import {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import type {
  Conversation,
  ConversationsPage,
  PublicUser,
} from '@chat/contracts';
import { UsersService } from '../users/users.service';
import { CONFIG, type Config } from '../common/config';
import { paginate } from '../common/pagination';
import { UserSocketsService } from '../realtime/user-sockets.service';
import {
  ConversationsRepository,
  type ConversationRecord,
} from './conversations.repository';
import { presentConversation } from './conversation.mapper';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly conversations: ConversationsRepository,
    private readonly users: UsersService,
    private readonly userSockets: UserSocketsService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async start(userId: string, otherId: string): Promise<Conversation> {
    if (userId === otherId)
      throw new BadRequestException({
        code: 'SELF_CONVERSATION',
        message: 'Choose another user',
      });
    const users = await this.loadUsers([userId, otherId]);
    const currentUser = this.getUser(users, userId);
    const counterpart = this.getUser(users, otherId);
    const { conversation, created } = await this.conversations.getOrCreate(
      userId,
      otherId,
    );
    const response = presentConversation(conversation, counterpart);
    if (created) {
      this.userSockets.emitToUser(userId, 'conversation:created', response);
      this.userSockets.emitToUser(
        otherId,
        'conversation:created',
        presentConversation(conversation, currentUser),
      );
    }
    return response;
  }

  async list(userId: string, cursor?: string): Promise<ConversationsPage> {
    const page = await paginate({
      cursor,
      scope: `conversations:${userId}`,
      secret: this.config.JWT_SECRET,
      load: ({ limit, after }) =>
        this.conversations.listForParticipant(
          userId,
          limit,
          after ? { createdAt: new Date(after.key), id: after.id } : undefined,
        ),
      position: (row) => ({ key: row.createdAt.toISOString(), id: row.id }),
    });
    const users = await this.loadUsers(
      page.items.flatMap((row) => row.participants),
    );
    return {
      items: page.items.map((row) => {
        const counterpartId = row.participants.find((id) => id !== userId);
        return presentConversation(row, this.getUser(users, counterpartId));
      }),
      nextCursor: page.nextCursor,
    };
  }

  async getForParticipant(
    conversationId: string,
    userId: string,
  ): Promise<Pick<ConversationRecord, 'id' | 'participants'>> {
    const conversation = await this.conversations.findForParticipant(
      conversationId,
      userId,
    );
    if (!conversation)
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
    return { id: conversation.id, participants: conversation.participants };
  }

  private getUser(
    users: Map<string, PublicUser>,
    id: string | undefined,
  ): PublicUser {
    const user = id === undefined ? undefined : users.get(id);
    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    return user;
  }

  private async loadUsers(ids: string[]): Promise<Map<string, PublicUser>> {
    const users = await this.users.findPublicByIds([...new Set(ids)]);
    return new Map(users.map((user) => [user.id, user]));
  }
}
