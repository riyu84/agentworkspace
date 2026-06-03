import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { AgentModule } from './agent/agent.module';
import { SeedModule } from './seed/seed.module';

@Module({
  imports: [ChatModule, AgentModule, SeedModule],
})
export class AppModule {}
