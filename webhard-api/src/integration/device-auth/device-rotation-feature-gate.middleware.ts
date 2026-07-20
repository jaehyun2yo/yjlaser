import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { DeviceAuthRotationRuntimeOptions } from './device-auth.runtime-config';
import { DEVICE_AUTH_ROTATION_OPTIONS } from './device-auth.tokens';

@Injectable()
export class DeviceRotationFeatureGateMiddleware implements NestMiddleware {
  public constructor(
    @Inject(DEVICE_AUTH_ROTATION_OPTIONS)
    private readonly options: Pick<DeviceAuthRotationRuntimeOptions, 'rotationRuntimeEnabled'>
  ) {}

  public use(_request: Request, response: Response, next: NextFunction): void {
    createDeviceRotationFeatureGateMiddleware(this.options)(_request, response, next);
  }
}

export function isDeviceRotationAdminRequest(request: Request): boolean {
  const rawUrl = request.originalUrl || request.url || '';
  let path: string;
  try {
    path = new URL(rawUrl, 'http://device-auth.invalid').pathname;
  } catch {
    return false;
  }
  return (
    /^\/api\/v1\/integration\/devices\/[^/?#]+\/credential-rotations(?:\/[^/?#]+(?:\/cancel)?)?\/?$/i.test(
      path
    ) ||
    /^\/api\/v1\/integration\/devices\/credential-rotations\/[^/?#]+\/(?:prepare|ack)\/?$/i.test(
      path
    )
  );
}

export function createDeviceRotationFeatureGateMiddleware(
  options: Pick<DeviceAuthRotationRuntimeOptions, 'rotationRuntimeEnabled'>
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!isDeviceRotationAdminRequest(request)) {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store, private');
    if (!options.rotationRuntimeEnabled) {
      response.status(404).json({ statusCode: 404, message: 'Not Found' });
      return;
    }
    next();
  };
}
