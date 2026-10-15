import { createZodDto } from 'nestjs-zod';
import { errorSchema } from '@chat/contracts/common';

export class ErrorDto extends createZodDto(errorSchema) {}
