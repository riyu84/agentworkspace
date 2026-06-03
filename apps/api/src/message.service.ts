// =====================================================
//  message.service.ts — CRUD de mensajes.
//  Stub de FASE 0: la implementación real va en FASE 1.
// =====================================================

import { Injectable } from '@nestjs/common';
import { Message, MessageRole, Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface CreateMessageInput {
  channelId: string;
  authorId: string;
  content: string;
  role: MessageRole | keyof typeof MessageRole;
  parentId?: string;
  metadata?: Prisma.InputJsonValue;
}

interface ActionBlock {
  type: 'button';
  actionId: string;
  label: string;
  value: string;
  style?: 'primary' | 'danger' | 'default';
  prompt?: string;
}

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMessageInput): Promise<Message> {
    return this.prisma.message.create({
      data: {
        channelId: input.channelId,
        authorId: input.authorId,
        content: input.content,
        role: input.role as MessageRole,
        parentId: input.parentId,
        metadata: input.metadata,
      },
    });
  }

  findById(id: string): Promise<Message | null> {
    return this.prisma.message.findUnique({ where: { id } });
  }

  findByIdWithAuthor(id: string) {
    return this.prisma.message.findUnique({
      where: { id },
      include: { author: true },
    });
  }

  /** Busca el button block dentro de metadata.blocks de un mensaje. */
  async findActionBlock(msg: Message, actionId: string): Promise<ActionBlock | null> {
    const meta = msg.metadata as { blocks?: ActionBlock[] } | null;
    const block = meta?.blocks?.find((b) => b.type === 'button' && b.actionId === actionId);
    return block ?? null;
  }
}
