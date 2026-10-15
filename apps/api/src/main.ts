import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { readConfig } from './common/config';
import { setup, openApi } from './setup';
async function main() {
  const config = readConfig(process.env);
  const app = await NestFactory.create(AppModule.configure(config));
  app.enableShutdownHooks();
  setup(app);
  SwaggerModule.setup('api/docs', app, openApi(app), {
    jsonDocumentUrl: '/api/openapi.json',
  });
  await app.listen(config.PORT, '0.0.0.0');
}
main();
