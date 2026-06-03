import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { MessageService } from '../message.service';
import { PrismaService } from '../prisma.service';
import { AgentEventBus } from '../agent/agent-event-bus.service';

@Module({
  providers: [ChatGateway, MessageService, PrismaService, AgentEventBus],
  exports: [MessageService, PrismaService, AgentEventBus],
})
export class ChatModule {}
