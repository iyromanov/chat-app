import { createZodDto } from 'nestjs-zod';
import { currentUserSchema } from '@chat/contracts';

export class CurrentUserDto extends createZodDto(currentUserSchema) {}
