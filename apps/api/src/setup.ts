import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc, ZodValidationPipe } from 'nestjs-zod';
import { COOKIE } from './auth/auth.constants';
import { ApiExceptionFilter } from './common/errors';
export function setup(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
}
export function openApi(app: INestApplication) {
  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Chat API')
        .setVersion('1.0')
        .addCookieAuth(COOKIE, { type: 'apiKey', in: 'cookie' }, COOKIE)
        .build(),
    ),
  );
}
