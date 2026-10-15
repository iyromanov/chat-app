import { createZodDto } from 'nestjs-zod';
import { loginSchema } from '@chat/contracts';

export class LoginDto extends createZodDto(loginSchema) {}
