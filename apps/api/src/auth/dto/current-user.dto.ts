import { createZodDto } from 'nestjs-zod';
import { currentUserSchema } from '@chat/contracts/users';

export class CurrentUserDto extends createZodDto(currentUserSchema) {}
