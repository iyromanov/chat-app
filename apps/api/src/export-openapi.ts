import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { Global, Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { CONFIG } from './common/config';
import { Clock, SystemClock } from './common/clock';
import { setup, openApi } from './setup';
// Metadata export deliberately does not connect to MongoDB.
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: CONFIG,
      useValue: { JWT_SECRET: 'openapi-export-placeholder-secret' },
    },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [CONFIG, Clock],
})
class ExportModule {}
async function main() {
  const module = await Test.createTestingModule({ imports: [ExportModule] })
    .overrideProvider(getModelToken('User'))
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  setup(app);
  writeFileSync('openapi.json', JSON.stringify(openApi(app), null, 2) + '\n');
  await app.close();
}
void main();
