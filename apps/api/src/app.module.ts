import { Module } from '@nestjs/common';
import { ChatModule } from './chat/chat.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [ChatModule, AgentModule],
})
export class AppModule {}
