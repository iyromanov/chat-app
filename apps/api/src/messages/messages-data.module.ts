import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, messageSchema } from './message.schema';
import { MessageActivityService } from './message-activity.service';
import { MessagesRepository } from './messages.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Message.name, schema: messageSchema }]),
  ],
  providers: [MessagesRepository, MessageActivityService],
  exports: [MessagesRepository, MessageActivityService],
})
export class MessagesDataModule {}
