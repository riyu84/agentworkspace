// =====================================================
//  agent-runner.ts — wrapper sobre LangGraph (ReAct + tools)
//  Esto es lo que hace que el agente EJECUTE, no solo hable.
// =====================================================

import { Injectable } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { McpClientService } from './mcp-client.service';

// --- Ejemplo de tool real para Pickit ---
// El agente de #facturacion valida Ingresos Brutos / Percepciones.
// Cast del schema para evitar TS2589 (recursion infinita en el inference de
// zod schemas + langchain tool()). Runtime intacto.
const validarFacturaSchema = z.object({
  cuit: z.string().describe('CUIT del proveedor'),
  monto: z.number().describe('Monto neto de la factura'),
});
const validarFacturaTool = tool(
  async ({ cuit, monto }: z.infer<typeof validarFacturaSchema>) => {
    // Acá iría la llamada a tu MCP server / microservicio de facturación
    // const res = await fetch(`${MCP_FACTURACION}/validate`, {...})
    return JSON.stringify({
      cuit,
      monto,
      percepcionIIBB: +(monto * 0.03).toFixed(2),
      estado: 'VALIDA',
    });
  },
  {
    name: 'validar_factura',
    description: 'Valida una factura y calcula percepciones de Ingresos Brutos por CUIT.',
    schema: validarFacturaSchema as any,
  },
);

// --- Tool especial: pedirle confirmacion al humano ---
// El agente la llama cuando quiere bajar el riesgo antes de ejecutar algo.
// Devuelve un marker JSON; el AgentRunner lo intercepta para empujar los
// blocks (botones) en metadata.blocks del mensaje del agente.
const solicitarConfirmacionSchema = z.object({
  prompt: z.string().describe('Pregunta a mostrarle al humano arriba de los botones'),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        style: z.enum(['primary', 'danger', 'default']).optional(),
      }),
    )
    .min(1)
    .describe('Botones: label visible, value que vuelve al agente, style opcional'),
});
const solicitarConfirmacionTool = tool(
  async ({ prompt, options }: z.infer<typeof solicitarConfirmacionSchema>) => {
    return JSON.stringify({ awaiting_human: true, prompt, options });
  },
  {
    name: 'solicitar_confirmacion',
    description:
      'Pide confirmacion al humano antes de proceder con una accion. Usala cuando vas a ' +
      'ejecutar algo con efecto (aprobar, enviar, cobrar). Devuelve un marker; en el ' +
      'mismo turno terminas tu respuesta y esperas el siguiente mensaje del humano.',
    schema: solicitarConfirmacionSchema as any,
  },
);

const TOOL_REGISTRY: Record<string, any> = {
  validar_factura: validarFacturaTool,
  solicitar_confirmacion: solicitarConfirmacionTool,
};

interface InvokeArgs {
  agentConfig: { systemPrompt: string; tools: string[]; mcpServers?: string[] };
  messages: { role: string; name: string; content: string }[];
}

@Injectable()
export class AgentRunner {
  constructor(private readonly mcp: McpClientService) {}

  async invoke(args: InvokeArgs) {
    const llm = new ChatAnthropic({
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
    });

    // Resolver las tools del registry estatico
    const localTools = args.agentConfig.tools
      .map((t) => TOOL_REGISTRY[t])
      .filter(Boolean);

    // Y las tools dinamicas que vienen de los MCP servers declarados.
    const mcpTools = args.agentConfig.mcpServers?.length
      ? await this.mcp.getToolsForServers(args.agentConfig.mcpServers)
      : [];

    const tools = [...localTools, ...mcpTools];

    // Grafo ReAct prebuilt: razonamiento -> tool -> razonamiento -> respuesta.
    // LangSmith lo traza solo si LANGCHAIN_TRACING_V2=true está en el env.
    const agent = createReactAgent({
      llm,
      tools,
      messageModifier: args.agentConfig.systemPrompt,
    });

    const out = await agent.invoke({
      messages: args.messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    });

    // Buscar el ultimo mensaje del agente que tenga TEXTO real. Si el ciclo
    // termino en tool_use puro (ej: solicitar_confirmacion), last.content
    // puede ser '' o un array de content blocks sin text.
    const extractText = (m: any): string => {
      const c = m?.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) {
        return c
          .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
          .map((b: any) => b.text)
          .join('\n');
      }
      return '';
    };
    let text = '';
    for (let i = out.messages.length - 1; i >= 0; i--) {
      const m: any = out.messages[i];
      // Solo mensajes del assistant (no tool results)
      if (m.constructor?.name === 'AIMessage' || m._getType?.() === 'ai' || m.role === 'assistant') {
        const t = extractText(m);
        if (t.trim()) {
          text = t;
          break;
        }
      }
    }

    // Extraer las tool calls que ejecutó para mostrarlas en el thread
    const toolCalls = out.messages
      .filter((m: any) => m.tool_calls?.length)
      .flatMap((m: any) => m.tool_calls);

    // Si la ultima ronda ejecuto solicitar_confirmacion, levantar los botones
    // a result.blocks para que el frontend los renderee debajo del mensaje.
    const blocks: any[] = [];
    const confirmations = toolCalls.filter((tc: any) => tc.name === 'solicitar_confirmacion');
    for (const tc of confirmations) {
      const args = tc.args ?? {};
      const opts = Array.isArray(args.options) ? args.options : [];
      for (const opt of opts) {
        blocks.push({
          type: 'button',
          actionId: `${tc.id ?? tc.name}:${opt.value}`,
          label: opt.label,
          value: opt.value,
          style: opt.style ?? 'default',
          prompt: args.prompt,
        });
      }
    }

    // Fallback: si el agente termino con solicitar_confirmacion sin texto,
    // mostramos el prompt de la confirmacion para que el humano vea algo.
    if (!text && blocks.length > 0) {
      text = blocks[0].prompt ?? '(esperando confirmacion)';
    }
    if (!text) text = '(sin respuesta)';

    return {
      text,
      traceId: (out as any).runId ?? null,
      toolCalls,
      blocks,
    };
  }
}
