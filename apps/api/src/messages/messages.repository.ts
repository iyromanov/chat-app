import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  Message as PublicMessage,
  SendMessage,
} from '@chat/contracts/messages';
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
    return presentMessage(
      (
        await this.messages.create({
          text: input.text,
          conversationId,
          senderId,
          createdAt: this.clock.now(),
        })
      ).toObject(),
    );
  }
  async list(
    conversationId: string,
    limit: number,
    after?: { key: string; id: string },
  ): Promise<PublicMessage[]> {
    const rows = await this.messages
      .find({
        conversationId,
        ...(after
          ? {
              $or: [
                { createdAt: { $lt: new Date(after.key) } },
                {
                  createdAt: new Date(after.key),
                  _id: { $lt: after.id },
                },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map(presentMessage);
  }
}
