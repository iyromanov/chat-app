import type { ServerEvents } from '@chat/contracts/realtime';
import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import { roomKeys } from './room-keys';

@Injectable()
export class UserSocketsService {
  private server!: Server<Record<string, never>, ServerEvents>;

  attachServer(server: Server<Record<string, never>, ServerEvents>): void {
    this.server = server;
  }

  joinUser(socket: Socket, userId: string): void | Promise<void> {
    return socket.join(roomKeys.user(userId));
  }

  emitToUser<Event extends keyof ServerEvents>(
    userId: string,
    event: Event,
    ...args: Parameters<ServerEvents[Event]>
  ): void {
    this.server.to(roomKeys.user(userId)).emit(event, ...args);
  }
}
