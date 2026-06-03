import { Controller, Get } from '@nestjs/common';
import { PresenceService } from './presence.service';

@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get()
  async list() {
    return { online: await this.presence.getOnline() };
  }
}
