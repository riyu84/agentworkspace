import { Module } from '@nestjs/common';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { AgentRunner } from './agent-runner';
import { McpClientService } from './mcp-client.service';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [ChatModule],
  providers: [AgentOrchestrator, AgentRunner, McpClientService],
})
export class AgentModule {}
