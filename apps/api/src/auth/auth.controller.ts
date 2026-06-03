import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string }) {
    return this.auth.login(body?.email);
  }

  @Get('me')
  async me(@Headers('authorization') header?: string) {
    const token = (header ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('falta Authorization');
    const payload = this.auth.verify(token);
    const member = await this.auth.me(payload.sub);
    return { member };
  }
}
