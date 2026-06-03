// =====================================================
//  seed.service.ts — bootstrap idempotente del MVP humano.
//  Crea 1 Workspace, 2 humanos y 1 channel si no existen.
// =====================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

const WORKSPACE_NAME = 'Pickit';
const CHANNEL_NAME = 'general';
const HUMAN_A = { email: 'ana@pickit.test', displayName: 'ana' };
const HUMAN_B = { email: 'beto@pickit.test', displayName: 'beto' };
const AGENT = {
  id: 'agent_facturacion_seed',
  displayName: 'agente-facturacion',
  systemPrompt:
    'Sos el agente de facturacion de Pickit. Tools disponibles:\n' +
    '- validar_factura(cuit, monto): valida y calcula IIBB.\n' +
    '- solicitar_confirmacion(prompt, options): mostra botones al humano.\n' +
    '- consultar_proveedor(cuit) [MCP]: trae datos del proveedor.\n' +
    '- lista_proveedores() [MCP]: lista todos los proveedores.\n' +
    '\n' +
    'Workflow:\n' +
    '1) Si te piden CONSULTAR/QUIEN ES/QUE SE de un proveedor: usa ' +
    'consultar_proveedor (o lista_proveedores) y responde en una frase ' +
    'breve con los datos relevantes (nombre, condicion IVA, saldo).\n' +
    '2) Si te piden VALIDAR una factura, usa validar_factura con CUIT y monto, ' +
    'y responde con estado y percepcion de IIBB.\n' +
    '3) Si te piden APROBAR/EJECUTAR algo con efecto (pagar, aprobar): ' +
    'primero consulta_proveedor + validar_factura si aplica, despues llama ' +
    'solicitar_confirmacion una sola vez con dos opciones: ' +
    '{label:"Aprobar", value:"approve", style:"primary"} y ' +
    '{label:"Cancelar", value:"cancel", style:"danger"}. ' +
    'En el texto repeti la pregunta para humanos sin botones. ' +
    'NO ejecutes la accion antes de la confirmacion.\n' +
    '4) Cuando el humano responde con "approve" (o un mensaje cuyo contenido ' +
    'incluya "Aprobar"/"approve"), NUNCA vuelvas a pedir confirmacion. ' +
    'Confirma con un mensaje breve y final tipo "Listo, factura aprobada. ' +
    'Operacion registrada." sin llamar mas tools.\n' +
    '5) Si el humano responde "cancel" o "Cancelar", abortas con un mensaje ' +
    'breve tipo "Operacion cancelada, no se hizo nada."',
  tools: ['validar_factura', 'solicitar_confirmacion'],
  mcpServers: ['pickit'],
};

@Injectable()
export class SeedService {
  constructor(private readonly prisma: PrismaService) {}

  async run() {
    const workspace = await this.prisma.workspace.upsert({
      where: { id: 'ws_pickit_seed' },
      update: { name: WORKSPACE_NAME },
      create: { id: 'ws_pickit_seed', name: WORKSPACE_NAME },
    });

    const [ana, beto] = await Promise.all([
      this.prisma.member.upsert({
        where: { email: HUMAN_A.email },
        update: {},
        create: {
          workspaceId: workspace.id,
          type: 'HUMAN',
          email: HUMAN_A.email,
          displayName: HUMAN_A.displayName,
        },
      }),
      this.prisma.member.upsert({
        where: { email: HUMAN_B.email },
        update: {},
        create: {
          workspaceId: workspace.id,
          type: 'HUMAN',
          email: HUMAN_B.email,
          displayName: HUMAN_B.displayName,
        },
      }),
    ]);

    const channel = await this.prisma.channel.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: CHANNEL_NAME } },
      update: {},
      create: { workspaceId: workspace.id, name: CHANNEL_NAME, topic: 'canal general' },
    });

    const agentConfig = {
      systemPrompt: AGENT.systemPrompt,
      tools: AGENT.tools,
      mcpServers: AGENT.mcpServers,
    };
    const agent = await this.prisma.member.upsert({
      where: { id: AGENT.id },
      update: { agentConfig },
      create: {
        id: AGENT.id,
        workspaceId: workspace.id,
        type: 'AGENT',
        displayName: AGENT.displayName,
        agentConfig,
      },
    });

    await this.prisma.channelSubscription.upsert({
      where: { channelId_memberId: { channelId: channel.id, memberId: agent.id } },
      update: { mode: 'mention' },
      create: { channelId: channel.id, memberId: agent.id, mode: 'mention' },
    });

    return { workspace, members: [ana, beto], channel, agent };
  }
}
