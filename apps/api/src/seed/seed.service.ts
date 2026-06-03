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

    return { workspace, members: [ana, beto], channel };
  }
}
