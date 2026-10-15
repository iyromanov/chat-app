import { createZodDto } from 'nestjs-zod';
import { registrationSchema } from '@chat/contracts';

export class RegistrationDto extends createZodDto(registrationSchema) {}
