import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import type { SessionUser } from '../../auth/auth.service';

type OperationsRequest = Request & {
  user?: SessionUser;
  apiKeyInfo?: {
    id: string;
    programType: string;
    permissions: string[];
  };
};

@Injectable()
export class OperationsAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OperationsRequest>();

    if (request.apiKeyInfo?.permissions.includes('operation/read')) {
      return true;
    }

    if (request.user?.userType === 'admin') {
      return true;
    }

    throw new ForbiddenException({
      code: 'INTEGRATION_OPERATION_ACCESS_DENIED',
      message: 'Operation read access required',
    });
  }
}
