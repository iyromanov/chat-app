import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PipelineStage } from 'mongoose';
import { Message } from './message.schema';

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
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                conversationId: 1,
                senderId: 1,
                text: 1,
                attemptId: 1,
                createdAt: {
                  $dateToString: {
                    date: '$createdAt',
                    format: '%Y-%m-%dT%H:%M:%S.%LZ',
                  },
                },
              },
            },
          ],
          as: 'latest',
        },
      },
      {
        $set: {
          lastMessage: { $ifNull: [{ $first: '$latest' }, null] },
          activityAt: {
            $ifNull: [
              {
                $dateFromString: {
                  dateString: { $first: '$latest.createdAt' },
                },
              },
              '$createdAt',
            ],
          },
        },
      },
      { $unset: 'latest' },
    ];
  }
}
