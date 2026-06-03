// =====================================================
//  agent-orchestrator.service.ts
//  Servicio SEPARADO del Gateway. Escucha eventos de Redis,
//  decide qué agente responde, invoca su grafo LangGraph,
//  ejecuta tools y devuelve la respuesta como mensaje normal.
// =====================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AgentEventBus } from './agent-event-bus.service';
import { MessageService } from '../message.service';
import { AgentRunner } from './agent-runner'; // wrapper LangGraph

@Injectable()
export class AgentOrchestrator implements OnModuleInit {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: AgentEventBus,
    private readonly messages: MessageService,
    private readonly runner: AgentRunner,
  ) {}

  onModuleInit() {
    // Cada mensaje de humano que el Gateway publicó pasa por acá.
    // Catch global: un agente que rompe NO debe crashear el API.
    this.eventBus.onDispatch((msg) =>
      this.handle(msg).catch((e) =>
        this.logger.error(`handle msg=${msg.id} fallo: ${e?.message ?? e}`),
      ),
    );
  }

  private async handle(msg: {
    id: string;
    channelId: string;
    content: string;
    authorId: string;
  }) {
    // 1. ¿Qué agentes deben despertar en este canal?
    const subs = await this.prisma.channelSubscription.findMany({
      where: { channelId: msg.channelId, member: { type: 'AGENT', isActive: true } },
      include: { member: true },
    });

    const mentioned = this.extractMentions(msg.content); // ['agente-facturacion']

    const toWake = subs.filter((s) => {
      if (s.mode === 'listen') return true;             // escucha todo
      return mentioned.includes(s.member.displayName);   // solo si lo @mencionan
    });

    // 2. Despertar cada agente en paralelo (no se bloquean entre sí).
    //    allSettled: el fallo de un agente NO impide que respondan los demás.
    const results = await Promise.allSettled(
      toWake.map((s) => this.runAgent(s.member, msg)),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        this.logger.error(`runAgent fallo: ${r.reason?.message ?? r.reason}`);
      }
    }
  }

  private async runAgent(agent: any, triggerMsg: any) {
    this.eventBus.emitTyping({ channelId: triggerMsg.channelId, agentId: agent.id });

    // 3. Contexto del canal: últimos N mensajes (memoria de corto plazo)
    const history = await this.prisma.message.findMany({
      where: { channelId: triggerMsg.channelId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { author: true },
    });

    // 4. Invocar el grafo LangGraph del agente. Acá ejecuta tools/MCP.
    //    LangSmith traza todo vía env vars (LANGCHAIN_TRACING_V2).
    const result = await this.runner.invoke({
      agentConfig: agent.agentConfig, // { systemPrompt, tools, mcpServers }
      messages: history.reverse().map((m) => ({
        role: m.author.type === 'AGENT' ? 'assistant' : 'user',
        name: m.author.displayName,
        content: m.content,
      })),
    });

    // 5. Persistir y emitir la respuesta como un mensaje más del canal.
    //    metadata lleva traceId de LangSmith + bloques interactivos.
    const reply = await this.messages.create({
      channelId: triggerMsg.channelId,
      authorId: agent.id,
      role: 'AGENT',
      content: result.text,
      parentId: triggerMsg.id, // respuesta en thread
      metadata: {
        traceId: result.traceId,
        toolCalls: result.toolCalls, // [{name, args, output}]
        blocks: result.blocks,       // [{type:'button', actionId, label}]
      },
    });

    this.eventBus.emitAgentMessage(reply); // el Gateway lo manda al canal
  }

  private extractMentions(text: string): string[] {
    return [...text.matchAll(/@([\w-]+)/g)].map((m) => m[1]);
  }
}
