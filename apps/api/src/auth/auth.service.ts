// =====================================================
//  auth.service.ts — login por email (sin password en MVP)
//  y verificacion de JWTs para el WS handshake.
// =====================================================

import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Member } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export interface JwtPayload {
  sub: string;             // memberId
  type: 'HUMAN' | 'AGENT';
  displayName: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string): Promise<{ token: string; member: Member }> {
    if (!email || typeof email !== 'string') {
      throw new UnauthorizedException('email requerido');
    }
    const member = await this.prisma.member.findUnique({ where: { email } });
    if (!member || member.type !== 'HUMAN' || !member.isActive) {
      throw new UnauthorizedException('member no encontrado');
    }
    const token = this.sign(member);
    return { token, member };
  }

  sign(member: Pick<Member, 'id' | 'type' | 'displayName'>): string {
    const payload: JwtPayload = {
      sub: member.id,
      type: member.type as 'HUMAN' | 'AGENT',
      displayName: member.displayName,
    };
    return this.jwt.sign(payload);
  }

  verify(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token);
    } catch (e: any) {
      this.logger.debug(`token invalido: ${e?.message}`);
      throw new UnauthorizedException('token invalido');
    }
  }

  async me(memberId: string): Promise<Member> {
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member || !member.isActive) throw new UnauthorizedException('member no encontrado');
    return member;
  }
}
