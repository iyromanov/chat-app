import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesDataModule } from './messages-data.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
@Module({
  imports: [RealtimeModule, ConversationsModule, MessagesDataModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
