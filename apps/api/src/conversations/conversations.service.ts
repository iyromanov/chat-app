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
import { decodeCursor, encodeCursor } from '../common/cursor';
import { UserSocketsService } from '../realtime/user-sockets.service';
import {
  ConversationsRepository,
  type ConversationRecord,
} from './conversations.repository';
import { presentConversation } from './conversation.mapper';

const PAGE_SIZE = 50;

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
    const scope = `conversations:${userId}`;
    const after = decodeCursor(cursor, scope, this.config.JWT_SECRET);
    const rows = await this.conversations.listForParticipant(
      userId,
      PAGE_SIZE + 1,
      after ? { createdAt: new Date(after.key), id: after.id } : undefined,
    );
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    const users = await this.loadUsers(page.flatMap((row) => row.participants));
    return {
      items: page.map((row) => {
        const counterpartId = row.participants.find((id) => id !== userId);
        return presentConversation(row, this.getUser(users, counterpartId));
      }),
      nextCursor:
        rows.length > PAGE_SIZE && last
          ? encodeCursor(
              { scope, key: last.createdAt.toISOString(), id: last.id },
              this.config.JWT_SECRET,
            )
          : null,
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
