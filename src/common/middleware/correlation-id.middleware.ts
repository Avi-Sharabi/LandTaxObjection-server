import { randomUUID } from 'crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const id = (req.headers['x-correlation-id'] as string | undefined) ?? randomUUID();
    (req as Request & { correlationId: string }).correlationId = id;
    res.setHeader('X-Correlation-Id', id);
    next();
  }
}
