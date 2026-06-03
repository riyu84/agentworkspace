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
}
