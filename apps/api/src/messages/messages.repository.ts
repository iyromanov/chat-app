import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  Message as PublicMessage,
  SendMessage,
} from '@chat/contracts/messages';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { Clock } from '../common/clock';
import { Message } from './message.schema';
import { presentMessage } from './message.mapper';
@Injectable()
export class MessagesRepository implements OnModuleInit {
  constructor(
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    private readonly clock: Clock,
  ) {}
  async onModuleInit(): Promise<void> {
    await this.messages.init();
  }
  async create(
    conversationId: string,
    senderId: string,
    input: SendMessage,
  ): Promise<PublicMessage> {
    try {
      return presentMessage(
        (
          await this.messages.create({
            ...input,
            conversationId,
            senderId,
            createdAt: this.clock.now(),
          })
        ).toObject(),
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.messages
        .findOne({ conversationId, senderId, attemptId: input.attemptId })
        .lean()
        .exec();
      if (!existing) throw error;
      if (existing.text !== input.text)
        throw new ConflictException({
          code: 'MESSAGE_ATTEMPT_CONFLICT',
          message: 'This attempt was already used for different text',
        });
      return presentMessage(existing);
    }
  }
  async position(
    conversationId: string,
    id: string,
  ): Promise<{ key: string; id: string }> {
    const message = await this.messages
      .findOne({ _id: id, conversationId })
      .lean()
      .exec();
    if (!message) throw new NotFoundException('Message not found');
    return { key: message.createdAt.toISOString(), id };
  }
  async list(
    conversationId: string,
    limit: number,
    after?: { key: string; id: string },
    newer = false,
  ): Promise<PublicMessage[]> {
    const rows = await this.messages
      .find({
        conversationId,
        ...(after
          ? {
              $or: [
                { createdAt: { [newer ? '$gt' : '$lt']: new Date(after.key) } },
                {
                  createdAt: new Date(after.key),
                  _id: { [newer ? '$gt' : '$lt']: after.id },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: newer ? 1 : -1, _id: newer ? 1 : -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map(presentMessage);
  }
}
