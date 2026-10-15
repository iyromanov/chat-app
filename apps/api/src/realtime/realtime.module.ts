import { Module } from '@nestjs/common';
import { UserSocketsService } from './user-sockets.service';

@Module({
  providers: [UserSocketsService],
  exports: [UserSocketsService],
})
export class RealtimeModule {}
