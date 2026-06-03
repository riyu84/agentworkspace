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
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { MessageService } from '../message.service';
import { AgentEventBus } from '../agent/agent-event-bus.service';
import { AuthService } from '../auth/auth.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly messages: MessageService,
    private readonly eventBus: AgentEventBus, // wrapper sobre Redis pub/sub
    private readonly auth: AuthService,
    private readonly presence: PresenceService,
  ) {
    // El Orchestrator emite respuestas de agentes por acá -> al canal
    this.eventBus.onAgentMessage((msg) => {
      this.server.to(`channel:${msg.channelId}`).emit('message', msg);
    });
    // Indicador "el agente está pensando…"
    this.eventBus.onAgentTyping(({ channelId, agentId }) => {
      this.server.to(`channel:${channelId}`).emit('agent:typing', { agentId });
    });
    // Presencia: broadcast a TODOS los sockets cuando alguien entra/sale.
    this.presence.onOnline(({ memberId }) => {
      this.server.emit('presence:online', { memberId });
    });
    this.presence.onOffline(({ memberId }) => {
      this.server.emit('presence:offline', { memberId });
    });
  }

  async handleConnection(client: Socket) {
    // Valida JWT desde handshake.auth.token. Si falta o es invalido,
    // desconecta el socket inmediatamente.
    const token = client.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      this.logger.warn(`socket ${client.id} sin token -> disconnect`);
      client.emit('auth:error', { reason: 'missing_token' });
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.auth.verify(token);
      client.data.memberId = payload.sub;
      client.data.displayName = payload.displayName;
      await this.presence.onConnect(payload.sub, client.id);
    } catch {
      this.logger.warn(`socket ${client.id} token invalido -> disconnect`);
      client.emit('auth:error', { reason: 'invalid_token' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const memberId = client.data.memberId;
    if (memberId) {
      await this.presence.onDisconnect(memberId, client.id);
    }
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
