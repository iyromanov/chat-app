import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { ZodError } from 'zod';
import type { Response } from 'express';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodValidationException) {
      const fields: Record<string, string[]> = {};
      for (const issue of (error.getZodError() as ZodError).issues)
        (fields[issue.path.join('.')] ??= []).push(issue.message);
      response.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Check the provided fields',
        fields,
      });
      return;
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'object' && 'code' in body
            ? body
            : { code: 'REQUEST_ERROR', message: error.message },
        );
      return;
    }
    Logger.error(error, 'Unhandled API error');
    response.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Unable to complete the request. Try again later',
    });
  }
}
