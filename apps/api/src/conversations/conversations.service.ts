import {
  BadRequestException,
  Injectable,
  Inject,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type {
  Conversation as PublicConversation,
  PublicUser,
} from '@chat/contracts';
import { UsersService } from '../users/users.service';
import { CONFIG, type Config } from '../common/config';
import { Clock } from '../common/clock';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { AuthGateway } from '../auth/auth.gateway';
import { Conversation } from './conversation.schema';
type StoredConversation = Conversation & { _id: Types.ObjectId };
@Injectable()
export class ConversationsService implements OnModuleInit {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    private readonly users: UsersService,
    private readonly clock: Clock,
    private readonly events: AuthGateway,
    @Inject(CONFIG) private readonly config: Config,
  ) {}
  async onModuleInit() {
    await this.conversations.init();
  }
  private present(
    conversation: StoredConversation,
    userId: string,
    users: PublicUser[],
  ): PublicConversation {
    const counterpart = users.find(
      (user) =>
        user.id === conversation.participants.find((id) => id !== userId),
    );
    if (!counterpart)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    return {
      id: conversation._id.toString(),
      counterpart,
      createdAt: conversation.createdAt.toISOString(),
      lastMessage: null,
    };
  }
  async start(userId: string, otherId: string) {
    if (userId === otherId)
      throw new BadRequestException({
        code: 'SELF_CONVERSATION',
        message: 'Choose another user',
      });
    const users = await this.users.findPublicByIds([userId, otherId]);
    if (users.length !== 2)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    const participants = [userId, otherId].sort();
    const pairKey = participants.join(':');
    let conversation = await this.conversations
      .findOne({ pairKey })
      .lean()
      .exec();
    if (!conversation) {
      try {
        conversation = (
          await this.conversations.create({
            participants,
            pairKey,
            createdAt: this.clock.now(),
          })
        ).toObject();
        for (const participant of participants)
          this.events.conversationCreated(
            participant,
            this.present(conversation, participant, users),
          );
      } catch (error) {
        if (
          typeof error !== 'object' ||
          error === null ||
          !('code' in error) ||
          error.code !== 11000
        )
          throw error;
        conversation = await this.conversations
          .findOne({ pairKey })
          .lean()
          .exec();
        if (!conversation) throw error;
      }
    }
    return this.present(conversation, userId, users);
  }
  async list(userId: string, cursor?: string) {
    const scope = `conversations:${userId}`;
    const after = decodeCursor(cursor, scope, this.config.JWT_SECRET);
    const rows = await this.conversations
      .find({
        participants: userId,
        ...(after
          ? {
              $or: [
                { createdAt: { $lt: new Date(after.key) } },
                { createdAt: new Date(after.key), _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(51)
      .lean()
      .exec();
    const page = rows.slice(0, 50);
    const last = page.at(-1);
    const users = await this.users.findPublicByIds([
      ...new Set(page.flatMap((row) => row.participants)),
    ]);
    return {
      items: page.map((row) => this.present(row, userId, users)),
      nextCursor:
        rows.length > 50 && last
          ? encodeCursor(
              {
                scope,
                key: last.createdAt.toISOString(),
                id: last._id.toString(),
              },
              this.config.JWT_SECRET,
            )
          : null,
    };
  }
  async requireParticipant(conversationId: string, userId: string) {
    const conversation = Types.ObjectId.isValid(conversationId)
      ? await this.conversations
          .findOne({ _id: conversationId, participants: userId })
          .lean()
          .exec()
      : null;
    if (!conversation)
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
    return {
      id: conversation._id.toString(),
      participants: conversation.participants,
    };
  }
}
