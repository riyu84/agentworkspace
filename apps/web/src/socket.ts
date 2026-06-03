import { io, Socket } from 'socket.io-client';
import { api } from './api';

export function makeSocket(memberId: string): Socket {
  return io(`${api.apiUrl}/chat`, {
    auth: { memberId },
    transports: ['websocket'],
    autoConnect: true,
  });
}
