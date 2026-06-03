// =====================================================
//  mcp-registry.ts — mapeo de nombre logico -> comando MCP.
//  El agentConfig solo guarda nombres ("pickit"); el comando concreto
//  vive aca para que el agentConfig sea portable entre devs.
// =====================================================

import { join } from 'path';

export interface McpServerSpec {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// __dirname en runtime: apps/api/dist/agent/. Subimos a la raiz del repo.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const PICKIT_ENTRY = join(REPO_ROOT, 'apps', 'mcp-pickit', 'src', 'server.ts');

export const MCP_REGISTRY: Record<string, McpServerSpec> = {
  pickit: {
    command: 'pnpm',
    args: ['exec', 'tsx', PICKIT_ENTRY],
  },
};

export function resolveMcpServer(name: string): McpServerSpec | null {
  return MCP_REGISTRY[name] ?? null;
}
