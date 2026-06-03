export type MemberType = 'HUMAN' | 'AGENT';
export type MessageRole = 'USER' | 'AGENT' | 'TOOL' | 'SYSTEM';

export interface Member {
  id: string;
  type: MemberType;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

export interface Channel {
  id: string;
  name: string;
  topic: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  members: Member[];
  channels: Channel[];
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
  type?: string;
}

export interface MessageMetadata {
  traceId?: string | null;
  toolCalls?: ToolCall[];
  blocks?: unknown[];
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  role: MessageRole;
  content: string;
  parentId: string | null;
  metadata: MessageMetadata | null;
  createdAt: string;
  author?: Member;
}
