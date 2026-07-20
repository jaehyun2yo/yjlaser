import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { invalidBootstrapRequest } from './device-bootstrap.errors';

const FORBIDDEN_BOOTSTRAP_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'x-api-key',
  'x-account-recovery-key',
  'x-csrf-token',
  'x-session-token',
  'origin',
  'referer',
] as const;

/**
 * Public enrollment must not accidentally become a browser/session or legacy
 * credential endpoint. The transport middleware enforces this before parsing;
 * this guard keeps the same boundary intact for every Nest test/app wiring.
 */
@Injectable()
export class DeviceBootstrapRequestSourceGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      FORBIDDEN_BOOTSTRAP_HEADERS.some((headerName) =>
        Object.prototype.hasOwnProperty.call(request.headers, headerName)
      )
    ) {
      throw invalidBootstrapRequest();
    }

    return true;
  }
}
