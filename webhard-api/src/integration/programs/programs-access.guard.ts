import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import type { SessionUser } from '../../auth/auth.service';
import { hasIntegrationPermission } from '../auth/integration-permissions';

type ProgramsRequest = Request & {
  user?: SessionUser;
  apiKeyInfo?: {
    id: string;
    programType: string;
    permissions: string[];
  };
};

@Injectable()
export class ProgramsAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProgramsRequest>();

    if (request.method === 'POST') {
      if (request.apiKeyInfo && hasIntegrationPermission(request.apiKeyInfo.permissions, 'event/write')) {
        return true;
      }

      throw new ForbiddenException({
        code: 'INTEGRATION_PROGRAM_HEARTBEAT_ACCESS_DENIED',
        message: 'Program heartbeat write access required',
      });
    }

    if (request.method === 'GET') {
      if (
        request.apiKeyInfo &&
        hasIntegrationPermission(request.apiKeyInfo.permissions, 'operation/read')
      ) {
        return true;
      }

      if (!request.apiKeyInfo && request.user?.userType === 'admin') {
        return true;
      }

      throw new ForbiddenException({
        code: 'INTEGRATION_PROGRAM_LIST_ACCESS_DENIED',
        message: 'Program list read access required',
      });
    }

    throw new ForbiddenException({
      code: 'INTEGRATION_PROGRAM_ACCESS_DENIED',
      message: 'Program access denied',
    });
  }
}
