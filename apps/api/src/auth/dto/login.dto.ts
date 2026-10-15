import { createZodDto } from 'nestjs-zod';
import { loginSchema } from '@chat/contracts/auth';

export class LoginDto extends createZodDto(loginSchema) {}
