import { createZodDto } from 'nestjs-zod';
import {
  messageParamsSchema,
  sendMessageSchema,
  messageSchema,
  messagesPageSchema,
  messagesQuerySchema,
} from '@chat/contracts/messages';
export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export class MessageDto extends createZodDto(messageSchema) {}
export class MessagesPageDto extends createZodDto(messagesPageSchema) {}
export class MessagesQueryDto extends createZodDto(messagesQuerySchema) {}

export class MessageParamsDto extends createZodDto(messageParamsSchema) {}
