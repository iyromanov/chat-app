import { createZodDto } from 'nestjs-zod';
import { usersQuerySchema, usersPageSchema } from '@chat/contracts/users';
export class UsersQueryDto extends createZodDto(usersQuerySchema) {}
export class UsersPageDto extends createZodDto(usersPageSchema) {}
