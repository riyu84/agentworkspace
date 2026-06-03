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

export interface LoginResponse {
  token: string;
  member: Member;
}

export interface MeResponse {
  member: Member;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
  type?: string;
}

export interface ButtonBlock {
  type: 'button';
  actionId: string;
  label: string;
  value: string;
  style?: 'primary' | 'danger' | 'default';
  prompt?: string;
}

export interface MessageMetadata {
  traceId?: string | null;
  toolCalls?: ToolCall[];
  blocks?: ButtonBlock[];
  /** Solo en mensajes USER autogenerados por click de boton. */
  action?: { messageId: string; actionId: string; value: string };
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
