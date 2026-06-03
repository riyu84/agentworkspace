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
    'Sos el agente de facturacion de Pickit. Cuando te pidan validar una factura, ' +
    'usa la tool validar_factura con el CUIT y monto que te pasen. Responde en una ' +
    'frase corta con el estado y la percepcion de IIBB que devuelve la tool.',
  tools: ['validar_factura'],
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

    const agent = await this.prisma.member.upsert({
      where: { id: AGENT.id },
      update: {
        agentConfig: { systemPrompt: AGENT.systemPrompt, tools: AGENT.tools },
      },
      create: {
        id: AGENT.id,
        workspaceId: workspace.id,
        type: 'AGENT',
        displayName: AGENT.displayName,
        agentConfig: { systemPrompt: AGENT.systemPrompt, tools: AGENT.tools },
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
