import { io, Socket } from 'socket.io-client';
import { api } from './api';

export function makeSocket(token: string): Socket {
  return io(`${api.apiUrl}/chat`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
  });
}
