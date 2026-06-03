// =====================================================
//  presence.service.ts — tracking online/offline en Redis.
//  Soporta multiples tabs por miembro (set de socketIds).
//  Emite presence:online cuando aparece el 1er socket de un member,
//  presence:offline cuando se va el ultimo.
// =====================================================

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

const KEY_ONLINE = 'presence:online';
const keySockets = (memberId: string) => `presence:sockets:${memberId}`;
const CH_ONLINE = 'presence:online';
const CH_OFFLINE = 'presence:offline';

export interface PresenceEvent {
  memberId: string;
}

type Listener<T> = (payload: T) => void | Promise<void>;

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  private pub!: Redis;
  private sub!: Redis;
  private cmd!: Redis; // cliente normal para SADD/SREM/SMEMBERS (sub no acepta otros cmds)

  private onlineListeners: Listener<PresenceEvent>[] = [];
  private offlineListeners: Listener<PresenceEvent>[] = [];

  async onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.pub = new Redis(url);
    this.sub = new Redis(url);
    this.cmd = new Redis(url);

    for (const c of [this.pub, this.sub, this.cmd]) {
      c.on('error', (e) => this.logger.error(`redis: ${e.message}`));
    }

    // Cleanup de estado stale al bootear (single instance MVP).
    await this.resetState();

    await this.sub.subscribe(CH_ONLINE, CH_OFFLINE);
    this.sub.on('message', (channel, payload) => {
      try {
        const data = JSON.parse(payload) as PresenceEvent;
        const listeners = channel === CH_ONLINE ? this.onlineListeners : this.offlineListeners;
        for (const l of listeners) void l(data);
      } catch (e: any) {
        this.logger.error(`bad payload on ${channel}: ${e.message}`);
      }
    });

    this.logger.log(`subscribed to ${CH_ONLINE}, ${CH_OFFLINE}`);
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => undefined);
    await this.pub?.quit().catch(() => undefined);
    await this.cmd?.quit().catch(() => undefined);
  }

  /** Limpia state heredado de un crash anterior. */
  private async resetState() {
    const stream = this.cmd.scanStream({ match: 'presence:sockets:*', count: 200 });
    const keys: string[] = [];
    for await (const batch of stream) {
      const arr = batch as string[];
      keys.push(...arr);
    }
    if (keys.length > 0) await this.cmd.del(...keys);
    await this.cmd.del(KEY_ONLINE);
  }

  async onConnect(memberId: string, socketId: string): Promise<void> {
    await this.cmd.sadd(keySockets(memberId), socketId);
    const size = await this.cmd.scard(keySockets(memberId));
    if (size === 1) {
      await this.cmd.sadd(KEY_ONLINE, memberId);
      await this.pub.publish(CH_ONLINE, JSON.stringify({ memberId }));
    }
  }

  async onDisconnect(memberId: string, socketId: string): Promise<void> {
    await this.cmd.srem(keySockets(memberId), socketId);
    const size = await this.cmd.scard(keySockets(memberId));
    if (size === 0) {
      await this.cmd.del(keySockets(memberId));
      await this.cmd.srem(KEY_ONLINE, memberId);
      await this.pub.publish(CH_OFFLINE, JSON.stringify({ memberId }));
    }
  }

  async getOnline(): Promise<string[]> {
    return this.cmd.smembers(KEY_ONLINE);
  }

  onOnline(cb: Listener<PresenceEvent>) {
    this.onlineListeners.push(cb);
  }

  onOffline(cb: Listener<PresenceEvent>) {
    this.offlineListeners.push(cb);
  }
}
