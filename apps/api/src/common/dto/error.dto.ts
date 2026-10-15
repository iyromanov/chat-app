import { createZodDto } from 'nestjs-zod';
import { errorSchema } from '@chat/contracts';

export class ErrorDto extends createZodDto(errorSchema) {}
