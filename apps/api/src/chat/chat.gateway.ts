// =====================================================
//  chat.gateway.ts — Socket.IO Gateway (NestJS)
//  Responsabilidad: realtime puro. NUNCA llama al LLM acá.
//  Publica eventos a Redis; el Orchestrator escucha aparte.
// =====================================================

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { MessageService } from '../message.service';
import { AgentEventBus } from '../agent/agent-event-bus.service';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly messages: MessageService,
    private readonly eventBus: AgentEventBus, // wrapper sobre Redis pub/sub
  ) {
    // El Orchestrator emite respuestas de agentes por acá -> al canal
    this.eventBus.onAgentMessage((msg) => {
      this.server.to(`channel:${msg.channelId}`).emit('message', msg);
    });
    // Indicador "el agente está pensando…"
    this.eventBus.onAgentTyping(({ channelId, agentId }) => {
      this.server.to(`channel:${channelId}`).emit('agent:typing', { agentId });
    });
  }

  handleConnection(client: Socket) {
    // TODO: validar JWT desde handshake.auth.token
    const memberId = client.handshake.auth?.memberId;
    client.data.memberId = memberId;
  }

  @SubscribeMessage('channel:join')
  joinChannel(@ConnectedSocket() c: Socket, @MessageBody() d: { channelId: string }) {
    c.join(`channel:${d.channelId}`);
  }

  @SubscribeMessage('message:send')
  async onMessage(
    @ConnectedSocket() c: Socket,
    @MessageBody() d: { channelId: string; content: string; parentId?: string },
  ) {
    // 1. Persistir el mensaje del humano
    const saved = await this.messages.create({
      channelId: d.channelId,
      authorId: c.data.memberId,
      content: d.content,
      parentId: d.parentId,
      role: 'USER',
    });

    // 2. Broadcast inmediato a los humanos del canal (latencia mínima)
    this.server.to(`channel:${d.channelId}`).emit('message', saved);

    // 3. Disparar a los agentes ASÍNCRONAMENTE. No esperamos al LLM.
    this.eventBus.dispatchToAgents(saved);
  }
}
