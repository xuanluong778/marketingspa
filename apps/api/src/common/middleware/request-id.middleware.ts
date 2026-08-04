import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const incoming = req.headers[REQUEST_ID_HEADER];
    (req as any).requestId =
      (typeof incoming === 'string' && incoming.trim()) || randomUUID();
    next();
  }
}
