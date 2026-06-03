// =====================================================
//  prisma.service.ts — wrapper sobre PrismaClient.
//  Stub de FASE 0: la conexión real (onModuleInit/onModuleDestroy)
//  se implementa en FASE 1 cuando la DB exista.
// =====================================================

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {}
