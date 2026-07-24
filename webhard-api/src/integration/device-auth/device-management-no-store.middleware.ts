import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const NO_STORE_CACHE_CONTROL = 'no-store, private';

@Injectable()
export class DeviceManagementNoStoreMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    next();
  }
}
