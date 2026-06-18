import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../auth.service';

/**
 * Decorator to get the current user from the request
 * Usage: @CurrentUser() user: SessionUser
 */
export const CurrentUser = createParamDecorator(
  (data: keyof SessionUser | undefined, ctx: ExecutionContext): SessionUser | SessionUser[keyof SessionUser] => {
    const request = ctx.switchToHttp().getRequest<Request & { user: SessionUser }>();
    const user = request.user;

    if (data) {
      return user[data];
    }

    return user;
  },
);
