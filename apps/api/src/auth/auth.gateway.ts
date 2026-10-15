import {
  currentUserSchema,
  type Conversation,
  type ServerEvents,
} from '@chat/contracts';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import type { Response, NextFunction } from 'express';
import { Clock } from '../common/clock';
import type { AuthRequest } from './auth-request';

@WebSocketGateway()
export class AuthGateway implements OnGatewayInit {
  @WebSocketServer() server!: Server<Record<string, never>, ServerEvents>;
  constructor(private readonly clock: Clock) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      const request = socket.request as AuthRequest;
      cookieParser()(
        request,
        {} as Response,
        (() => {
          passport.authenticate(
            'jwt',
            { session: false },
            (error: unknown, user: unknown) => {
              if (error || !user)
                return next(new Error('Authentication required'));
              socket.data.auth = request.auth;
              socket.data.userId = currentUserSchema.parse(user).id;
              next();
            },
          )(request, {} as Response, next as NextFunction);
        }) as NextFunction,
      );
    });
  }

  handleConnection(socket: Socket) {
    const { loginId, expiresAt } = socket.data.auth as AuthRequest['auth'];
    void socket.join(`login:${loginId}`);
    void socket.join(`user:${socket.data.userId}`);
    socket.emit('auth:ready', { expiresAt: expiresAt.toISOString() });
    const cancel = this.clock.scheduleAt(expiresAt, () => {
      socket.emit('auth:ended');
      socket.disconnect(true);
    });
    socket.once('disconnect', cancel);
  }

  conversationCreated(userId: string, conversation: Conversation) {
    this.server.to(`user:${userId}`).emit('conversation:created', conversation);
  }

  logout(loginId: string) {
    const room = `login:${loginId}`;
    this.server.to(room).emit('auth:ended');
    this.server.in(room).disconnectSockets(true);
  }
}
