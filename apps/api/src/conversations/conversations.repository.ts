import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Message } from '@chat/contracts/messages';
import { Model, Types } from 'mongoose';
import {
  MessageActivityService,
  type MessageActivityRecord,
} from '../messages/message-activity.service';
import { Clock } from '../common/clock';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { Conversation } from './conversation.schema';

export type ConversationRecord = {
  id: string;
  participants: string[];
  createdAt: Date;
  lastMessage?: Message | null;
  activityAt?: Date;
};

type ConversationPosition = { activityAt: Date; id: string };
type StoredConversation = Conversation & { _id: Types.ObjectId };

function toRecord(conversation: StoredConversation): ConversationRecord {
  return {
    id: conversation._id.toString(),
    participants: conversation.participants,
    createdAt: conversation.createdAt,
  };
}

@Injectable()
export class ConversationsRepository implements OnModuleInit {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversations: Model<Conversation>,
    private readonly clock: Clock,
    private readonly messageActivity: MessageActivityService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.conversations.init();
  }

  async getOrCreate(
    userId: string,
    otherId: string,
  ): Promise<{ conversation: ConversationRecord; created: boolean }> {
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
  ): Promise<ConversationRecord[]> {
    const rows = await this.conversations
      .aggregate<StoredConversation & MessageActivityRecord>([
        { $match: { participants: userId } },
        ...this.messageActivity.latestForConversationPipeline(),
        ...(after
          ? [
              {
                $match: {
                  $or: [
                    { activityAt: { $lt: after.activityAt } },
                    {
                      activityAt: after.activityAt,
                      _id: { $lt: new Types.ObjectId(after.id) },
                    },
                  ],
                },
              },
            ]
          : []),
        { $sort: { activityAt: -1, _id: -1 } },
        { $limit: limit },
      ])
      .exec();
    return rows.map((row) => ({
      ...toRecord(row),
      ...this.messageActivity.presentActivity(row),
    }));
  }

  async withActivity(
    conversation: ConversationRecord,
  ): Promise<ConversationRecord> {
    const [row] = await this.conversations
      .aggregate<StoredConversation & MessageActivityRecord>([
        { $match: { _id: new Types.ObjectId(conversation.id) } },
        ...this.messageActivity.latestForConversationPipeline(),
      ])
      .exec();
    return {
      ...conversation,
      ...this.messageActivity.presentActivity(row),
    };
  }

  async findForParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord | null> {
    if (!Types.ObjectId.isValid(conversationId)) return null;
    const conversation = await this.conversations
      .findOne({ _id: conversationId, participants: userId })
      .lean()
      .exec();
    return conversation ? toRecord(conversation) : null;
  }

  private async findByPairKey(
    pairKey: string,
  ): Promise<ConversationRecord | null> {
    const conversation = await this.conversations
      .findOne({ pairKey })
      .lean()
      .exec();
    return conversation ? toRecord(conversation) : null;
  }
}
