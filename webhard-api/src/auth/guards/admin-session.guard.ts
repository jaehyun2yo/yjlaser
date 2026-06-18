import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { SessionUser } from '../auth.service';

/**
 * AdminGuard 의 세션 한정 변형.
 *
 * `ApiKeyGuard` 가 외부 X-API-Key 인증 시 user 에 `userType: 'admin'` 을 부여하므로
 * 단순 AdminGuard 는 외부 통합 프로그램으로도 통과된다. 이 가드는 `apiKeyInfo` 존재 시
 * 거절하여 admin **세션** 출처 호출만 허용한다.
 *
 * cascadeBackfill 같이 contact 데이터 일괄 변경 가능한 endpoint 에 사용.
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: SessionUser; apiKeyInfo?: unknown }>();
    const user = request.user;

    if (!user || user.userType !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    if (request.apiKeyInfo) {
      throw new ForbiddenException('Admin session required (API key not allowed)');
    }

    return true;
  }
}
