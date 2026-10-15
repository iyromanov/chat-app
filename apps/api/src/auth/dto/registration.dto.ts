import { createZodDto } from 'nestjs-zod';
import { registrationSchema } from '@chat/contracts/auth';

export class RegistrationDto extends createZodDto(registrationSchema) {}
