import { Module } from '@nestjs/common';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentRunner } from './agent-runner';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  providers: [AgentOrchestrator, AgentRunner],
})
export class AgentModule {}
