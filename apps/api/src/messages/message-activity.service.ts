import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PipelineStage } from 'mongoose';
import type { Message as PublicMessage } from '@chat/contracts/messages';
import { Message } from './message.schema';
import { presentMessage, type StoredMessage } from './message.mapper';

export type MessageActivityRecord = {
  lastMessage: StoredMessage | null;
  activityAt: Date;
};

/** Supplies the indexed latest-message join without exposing the owned model. */
@Injectable()
export class MessageActivityService {
  constructor(
    @InjectModel(Message.name) private readonly messages: Model<Message>,
  ) {}
  latestForConversationPipeline(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: this.messages.collection.name,
          let: { conversationId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$conversationId', '$$conversationId'] },
              },
            },
            { $sort: { createdAt: -1, _id: -1 } },
            { $limit: 1 },
          ],
          as: 'latest',
        },
      },
      {
        $set: {
          lastMessage: { $ifNull: [{ $first: '$latest' }, null] },
          activityAt: {
            $ifNull: [{ $first: '$latest.createdAt' }, '$createdAt'],
          },
        },
      },
      { $unset: 'latest' },
    ];
  }
  presentActivity(row: MessageActivityRecord): {
    lastMessage: PublicMessage | null;
    activityAt: Date;
  } {
    return {
      lastMessage: row.lastMessage ? presentMessage(row.lastMessage) : null,
      activityAt: row.activityAt,
    };
  }
}
