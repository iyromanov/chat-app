import { DynamicModule, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import type { Config } from './common/config';
import { RuntimeModule } from './common/runtime.module';

@Module({})
export class AppModule {
  static configure(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RuntimeModule.configure(config),
        MongooseModule.forRoot(config.MONGODB_URI),
        AuthModule,
      ],
    };
  }
}
