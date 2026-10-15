import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Clock } from '../common/clock';
import { Conversation } from './conversation.schema';

export type ConversationRecord = {
  id: string;
  participants: string[];
  createdAt: Date;
};

type ConversationPosition = { createdAt: Date; id: string };
type StoredConversation = Conversation & { _id: Types.ObjectId };

function toRecord(conversation: StoredConversation): ConversationRecord {
  return {
    id: conversation._id.toString(),
    participants: conversation.participants,
    createdAt: conversation.createdAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  const duplicateKeyCode = 11000;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === duplicateKeyCode
  );
}

@Injectable()
export class ConversationsRepository implements OnModuleInit {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    private readonly clock: Clock,
  ) {}

  async onModuleInit() {
    await this.conversations.init();
  }

  async getOrCreate(userId: string, otherId: string) {
    const participants = [userId, otherId].sort();
    const pairKey = participants.join(':');
    const existing = await this.findByPairKey(pairKey);
    if (existing) return { conversation: existing, created: false };

    let inserted: StoredConversation;
    try {
      inserted = (
        await this.conversations.create({
          participants,
          pairKey,
          createdAt: this.clock.now(),
        })
      ).toObject();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const concurrent = await this.findByPairKey(pairKey);
      if (!concurrent) throw error;
      return { conversation: concurrent, created: false };
    }
    return { conversation: toRecord(inserted), created: true };
  }

  async listForParticipant(
    userId: string,
    limit: number,
    after?: ConversationPosition,
  ) {
    const rows = await this.conversations
      .find({
        participants: userId,
        ...(after
          ? {
              $or: [
                { createdAt: { $lt: after.createdAt } },
                { createdAt: after.createdAt, _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec();
    return rows.map(toRecord);
  }

  async findForParticipant(conversationId: string, userId: string) {
    if (!Types.ObjectId.isValid(conversationId)) return null;
    const conversation = await this.conversations
      .findOne({ _id: conversationId, participants: userId })
      .lean()
      .exec();
    return conversation ? toRecord(conversation) : null;
  }

  private async findByPairKey(pairKey: string) {
    const conversation = await this.conversations
      .findOne({ pairKey })
      .lean()
      .exec();
    return conversation ? toRecord(conversation) : null;
  }
}
