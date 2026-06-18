import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, SessionUser } from '../auth.service';

const SESSION_COOKIE_NAMES = ['admin-session', 'company-session'] as const;

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // admin-session, company-session 순서로 확인
    let user: SessionUser | null = null;
    for (const cookieName of SESSION_COOKIE_NAMES) {
      const sessionCookie = request.cookies?.[cookieName];
      if (sessionCookie) {
        user = this.authService.verifySession(sessionCookie);
        if (user) break;
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid or missing session');
    }

    // Attach user to request
    (request as Request & { user: SessionUser }).user = user;

    return true;
  }
}
