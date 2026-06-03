// =====================================================
//  agent-event-bus.service.ts — pub/sub Gateway <-> Orchestrator.
//  Stub de FASE 0: define la API que usan Gateway y Orchestrator.
//  Implementación real con ioredis va en FASE 1.
// =====================================================

import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';

export interface TypingEvent {
  channelId: string;
  agentId: string;
}

type Listener<T> = (payload: T) => void | Promise<void>;

@Injectable()
export class AgentEventBus {
  private dispatchListeners: Listener<Message>[] = [];
  private agentMessageListeners: Listener<Message>[] = [];
  private typingListeners: Listener<TypingEvent>[] = [];

  dispatchToAgents(msg: Message): void {
    for (const l of this.dispatchListeners) void l(msg);
  }

  onDispatch(cb: Listener<Message>): void {
    this.dispatchListeners.push(cb);
  }

  emitAgentMessage(msg: Message): void {
    for (const l of this.agentMessageListeners) void l(msg);
  }

  onAgentMessage(cb: Listener<Message>): void {
    this.agentMessageListeners.push(cb);
  }

  emitTyping(event: TypingEvent): void {
    for (const l of this.typingListeners) void l(event);
  }

  onAgentTyping(cb: Listener<TypingEvent>): void {
    this.typingListeners.push(cb);
  }
}
