import type { ServerEvents } from '@chat/contracts';
import { Injectable } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';

@Injectable()
export class UserSocketsService {
  private server!: Server<Record<string, never>, ServerEvents>;

  attachServer(server: Server<Record<string, never>, ServerEvents>) {
    this.server = server;
  }

  joinUser(socket: Socket, userId: string) {
    return socket.join(this.userRoom(userId));
  }

  emitToUser<Event extends keyof ServerEvents>(
    userId: string,
    event: Event,
    ...args: Parameters<ServerEvents[Event]>
  ) {
    this.server.to(this.userRoom(userId)).emit(event, ...args);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
