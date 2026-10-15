import { MessagesDataModule } from '../messages/messages-data.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { Conversation, conversationSchema } from './conversation.schema';
import { ConversationsService } from './conversations.service';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsController } from './conversations.controller';
@Module({
  imports: [
    RealtimeModule,
    MessagesDataModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: conversationSchema },
    ]),
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
  exports: [ConversationsService],
})
export class ConversationsModule {}
