// =====================================================
//  mcp-pickit/server.ts — MCP server stdio con tools de dominio Pickit.
//  Lo arranca el AgentRunner como subprocess via @langchain/mcp-adapters.
// =====================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// "Base de datos" mock de proveedores.
const PROVEEDORES: Record<
  string,
  { nombre: string; condicionIva: 'RI' | 'MT'; rubro: string; saldoPendiente: number }
> = {
  '20-12345678-9': {
    nombre: 'Logistica del Plata S.A.',
    condicionIva: 'RI',
    rubro: 'transporte',
    saldoPendiente: 24500,
  },
  '30-71659428-1': {
    nombre: 'Empaques Norte SRL',
    condicionIva: 'RI',
    rubro: 'packaging',
    saldoPendiente: 0,
  },
  '20-99887766-5': {
    nombre: 'Cesar Gomez (monotributista)',
    condicionIva: 'MT',
    rubro: 'cadeteria',
    saldoPendiente: 3200,
  },
};

const server = new Server(
  { name: 'mcp-pickit', version: '0.0.1' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'consultar_proveedor',
      description:
        'Trae datos del proveedor a partir de su CUIT (formato XX-XXXXXXXX-X): ' +
        'razon social, condicion frente a IVA, rubro y saldo pendiente.',
      inputSchema: {
        type: 'object',
        properties: {
          cuit: { type: 'string', description: 'CUIT del proveedor' },
        },
        required: ['cuit'],
      },
    },
    {
      name: 'lista_proveedores',
      description: 'Lista todos los proveedores registrados con su CUIT y nombre.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  if (name === 'consultar_proveedor') {
    const cuit = String(args.cuit ?? '').trim();
    const data = PROVEEDORES[cuit];
    if (!data) {
      return {
        content: [
          { type: 'text', text: JSON.stringify({ encontrado: false, cuit }) },
        ],
      };
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify({ encontrado: true, cuit, ...data }) },
      ],
    };
  }

  if (name === 'lista_proveedores') {
    const items = Object.entries(PROVEEDORES).map(([cuit, p]) => ({
      cuit,
      nombre: p.nombre,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(items) }] };
  }

  return {
    content: [{ type: 'text', text: `tool desconocida: ${name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stdio: no logs a stdout (rompe el protocolo). stderr esta bien.
process.stderr.write('mcp-pickit listo\n');
