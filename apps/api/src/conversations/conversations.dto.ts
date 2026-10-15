import { createZodDto } from 'nestjs-zod';
import {
  startConversationSchema,
  conversationSchema,
  conversationsPageSchema,
  conversationsQuerySchema,
} from '@chat/contracts/conversations';
export class StartConversationDto extends createZodDto(
  startConversationSchema,
) {}
export class ConversationDto extends createZodDto(conversationSchema) {}
export class ConversationsPageDto extends createZodDto(
  conversationsPageSchema,
) {}
export class ConversationsQueryDto extends createZodDto(
  conversationsQuerySchema,
) {}
