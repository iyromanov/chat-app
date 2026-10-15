import { DynamicModule, Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from './config';
import { Clock, SystemClock } from './clock';

@Global()
@Module({})
export class RuntimeModule {
  static configure(config: Config): DynamicModule {
    return {
      module: RuntimeModule,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: Clock, useClass: SystemClock },
      ],
      exports: [CONFIG, Clock],
    };
  }
}
