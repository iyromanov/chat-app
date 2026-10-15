import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from 'nestjs-zod';
import type { Request } from 'express';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    // Guards run before global pipes; Passport must receive validated credentials.
    request.body = new ZodValidationPipe(LoginDto).transform(request.body, {
      type: 'body',
    });
    return super.canActivate(context);
  }
}
