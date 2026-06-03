// =====================================================
//  agent-runner.ts — wrapper sobre LangGraph (ReAct + tools)
//  Esto es lo que hace que el agente EJECUTE, no solo hable.
// =====================================================

import { Injectable } from '@nestjs/common';
import { ChatAnthropic } from '@langchain/anthropic';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

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

const TOOL_REGISTRY: Record<string, any> = {
  validar_factura: validarFacturaTool,
};

interface InvokeArgs {
  agentConfig: { systemPrompt: string; tools: string[]; mcpServers?: string[] };
  messages: { role: string; name: string; content: string }[];
}

@Injectable()
export class AgentRunner {
  async invoke(args: InvokeArgs) {
    const llm = new ChatAnthropic({
      model: 'claude-sonnet-4-20250514',
      temperature: 0,
    });

    // Resolver las tools que este agente tiene habilitadas
    const tools = args.agentConfig.tools
      .map((t) => TOOL_REGISTRY[t])
      .filter(Boolean);

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

    const last = out.messages[out.messages.length - 1];

    // Extraer las tool calls que ejecutó para mostrarlas en el thread
    const toolCalls = out.messages
      .filter((m: any) => m.tool_calls?.length)
      .flatMap((m: any) => m.tool_calls);

    return {
      text: last.content as string,
      traceId: (out as any).runId ?? null,
      toolCalls,
      blocks: [], // acá podés inyectar botones de confirmación a futuro
    };
  }
}
