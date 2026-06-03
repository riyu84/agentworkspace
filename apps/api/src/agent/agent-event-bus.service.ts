// =====================================================
//  agent-event-bus.service.ts — pub/sub Redis entre Gateway y Orchestrator.
//  Por qué dos clientes: ioredis en modo subscriber no puede publicar,
//  así que necesitamos uno para publish y otro para subscribe.
// =====================================================

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import type { Message } from '@prisma/client';

export interface TypingEvent {
  channelId: string;
  agentId: string;
}

type Listener<T> = (payload: T) => void | Promise<void>;

const CH_DISPATCH = 'dispatch';
const CH_AGENT_MESSAGE = 'agent:message';
const CH_AGENT_TYPING = 'agent:typing';

@Injectable()
export class AgentEventBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentEventBus.name);
  private pub!: Redis;
  private sub!: Redis;

  private dispatchListeners: Listener<Message>[] = [];
  private agentMessageListeners: Listener<Message>[] = [];
  private typingListeners: Listener<TypingEvent>[] = [];

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.pub = new Redis(url, { lazyConnect: false });
    this.sub = new Redis(url, { lazyConnect: false });

    this.pub.on('error', (e) => this.logger.error(`pub redis: ${e.message}`));
    this.sub.on('error', (e) => this.logger.error(`sub redis: ${e.message}`));

    await this.sub.subscribe(CH_DISPATCH, CH_AGENT_MESSAGE, CH_AGENT_TYPING);
    this.sub.on('message', (channel, payload) => {
      try {
        const data = JSON.parse(payload);
        const listeners = this.listenersFor(channel);
        for (const l of listeners) void l(data);
      } catch (e: any) {
        this.logger.error(`bad payload on ${channel}: ${e.message}`);
      }
    });

    this.logger.log(`subscribed to ${CH_DISPATCH}, ${CH_AGENT_MESSAGE}, ${CH_AGENT_TYPING}`);
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => undefined);
    await this.pub?.quit().catch(() => undefined);
  }

  dispatchToAgents(msg: Message): void {
    void this.pub.publish(CH_DISPATCH, JSON.stringify(msg));
  }

  onDispatch(cb: Listener<Message>): void {
    this.dispatchListeners.push(cb);
  }

  emitAgentMessage(msg: Message): void {
    void this.pub.publish(CH_AGENT_MESSAGE, JSON.stringify(msg));
  }

  onAgentMessage(cb: Listener<Message>): void {
    this.agentMessageListeners.push(cb);
  }

  emitTyping(event: TypingEvent): void {
    void this.pub.publish(CH_AGENT_TYPING, JSON.stringify(event));
  }

  onAgentTyping(cb: Listener<TypingEvent>): void {
    this.typingListeners.push(cb);
  }

  private listenersFor(channel: string): Listener<any>[] {
    switch (channel) {
      case CH_DISPATCH:
        return this.dispatchListeners;
      case CH_AGENT_MESSAGE:
        return this.agentMessageListeners;
      case CH_AGENT_TYPING:
        return this.typingListeners;
      default:
        return [];
    }
  }
}
