import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { AgentModule } from './agent/agent.module';
import { SeedModule } from './seed/seed.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AuthModule, ChatModule, AgentModule, SeedModule],
})
export class AppModule {}
