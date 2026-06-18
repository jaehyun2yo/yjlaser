import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../auth.service';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: SessionUser; apiKeyInfo?: unknown }>();
    const user = request.user;

    if (!user || user.userType !== 'admin' || request.apiKeyInfo) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
