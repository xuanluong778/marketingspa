import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Process liveness — does not probe dependencies. */
  @Get()
  live() {
    return this.health.liveness();
  }
}

@Controller('ready')
export class ReadyController {
  constructor(private readonly health: HealthService) {}

  /** PostgreSQL + Redis must be up. Worker is reported but not required for 200. */
  @Get()
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await this.health.readiness();
    if (!result.ok) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result.body;
  }
}
