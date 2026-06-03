import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SeedService } from './seed.service';
import { PrismaService } from '../prisma.service';

@Controller()
export class SeedController {
  constructor(
    private readonly seed: SeedService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('seed')
  runSeed() {
    return this.seed.run();
  }

  @Get('workspaces/:id')
  async getWorkspace(@Param('id') id: string) {
    return this.prisma.workspace.findUnique({
      where: { id },
      include: { members: true, channels: true },
    });
  }

  @Get('channels/:id/messages')
  async getMessages(@Param('id') id: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 1), 200);
    const rows = await this.prisma.message.findMany({
      where: { channelId: id },
      orderBy: { createdAt: 'desc' },
      take,
      include: { author: true },
    });
    return rows.reverse();
  }
}
