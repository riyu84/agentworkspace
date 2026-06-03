// =====================================================
//  mcp-client.service.ts — cachea conexiones a MCP servers stdio.
//  1 cliente por server. Reutilizamos entre invocaciones para no
//  spawnear un subprocess cada vez que despierta el agente.
// =====================================================

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { resolveMcpServer } from './mcp-registry';

interface CachedClient {
  client: MultiServerMCPClient;
  tools: any[];
}

@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private cache = new Map<string, Promise<CachedClient>>();

  /**
   * Devuelve las tools (LangGraph) de la lista de servers logicos.
   * Si alguno falla, lo loguea y sigue con los demas.
   */
  async getToolsForServers(serverNames: string[]): Promise<any[]> {
    const out: any[] = [];
    for (const name of serverNames) {
      try {
        const cached = await this.ensureClient(name);
        out.push(...cached.tools);
      } catch (e: any) {
        this.logger.error(`mcp[${name}] no se pudo cargar: ${e?.message ?? e}`);
      }
    }
    return out;
  }

  private ensureClient(name: string): Promise<CachedClient> {
    const existing = this.cache.get(name);
    if (existing) return existing;
    const promise = this.spawnAndConnect(name).catch((e) => {
      // Si fallo, no cachear el reject para que el proximo intento reintente.
      this.cache.delete(name);
      throw e;
    });
    this.cache.set(name, promise);
    return promise;
  }

  private async spawnAndConnect(name: string): Promise<CachedClient> {
    const spec = resolveMcpServer(name);
    if (!spec) throw new Error(`mcp server desconocido: "${name}"`);

    this.logger.log(`mcp[${name}] spawn: ${spec.command} ${spec.args.join(' ')}`);
    const client = new MultiServerMCPClient({
      mcpServers: {
        [name]: {
          transport: 'stdio',
          command: spec.command,
          args: spec.args,
          env: spec.env,
        },
      },
    });

    const tools = await client.getTools();
    this.logger.log(`mcp[${name}] conectado, ${tools.length} tool(s): ${tools.map((t: any) => t.name).join(', ')}`);
    return { client, tools };
  }

  async onModuleDestroy() {
    for (const [name, p] of this.cache.entries()) {
      try {
        const { client } = await p;
        await client.close();
        this.logger.log(`mcp[${name}] cerrado`);
      } catch {
        // ignore
      }
    }
    this.cache.clear();
  }
}
