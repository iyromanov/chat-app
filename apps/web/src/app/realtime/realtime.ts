import { io, type Socket } from 'socket.io-client';
import type { ServerEvents } from '@chat/contracts/realtime';

type RealtimeHandlers = {
  connected: () => void;
  connectionFailed: () => void;
  authEnded: () => void;
  conversationCreated: (data: unknown) => void;
  messageCreated: (data: unknown) => void;
};

export function createRealtime(
  url: string | undefined,
  handlers: RealtimeHandlers,
) {
  const socket: Socket<ServerEvents> = io(url, {
    withCredentials: true,
    autoConnect: false,
  });
  let disposed = false;

  socket.on('connect', () => {
    if (!disposed) handlers.connected();
  });
  socket.on('connect_error', () => {
    if (!disposed) handlers.connectionFailed();
  });
  socket.on('auth:ended', () => {
    if (!disposed) handlers.authEnded();
  });
  socket.on('conversation:created', (data) => {
    if (!disposed) handlers.conversationCreated(data);
  });
  socket.on('message:created', (data) => {
    if (!disposed) handlers.messageCreated(data);
  });

  return {
    connect() {
      if (!disposed) socket.connect();
    },
    dispose() {
      disposed = true;
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
