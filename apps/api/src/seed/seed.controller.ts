import { Controller, Get, Param, Post } from '@nestjs/common';
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
}
