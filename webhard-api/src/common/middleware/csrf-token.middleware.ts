import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

const SESSION_COOKIE_NAMES = ['admin-session', 'company-session', 'worker-session', 'erp-session'];
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_TOKEN_BYTES = 32;

/**
 * CSRF 토큰 자동 발급 미들웨어.
 *
 * 세션 쿠키가 있고 csrf-token 쿠키가 없는 경우에만 토큰을 새로 발급합니다.
 * httpOnly: false — 클라이언트 JS에서 읽어 X-CSRF-Token 헤더로 전송할 수 있어야 함.
 */
@Injectable()
export class CsrfTokenMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const cookies = req.cookies as Record<string, string> | undefined;

    // 기존 csrf-token이 있으면 재발급 불필요
    if (cookies?.[CSRF_COOKIE_NAME]) {
      return next();
    }

    // 세션 쿠키가 있을 때만 발급
    const hasSession = SESSION_COOKIE_NAMES.some((name) => cookies?.[name]);
    if (!hasSession) {
      return next();
    }

    const token = crypto.randomBytes(CSRF_TOKEN_BYTES).toString('hex');

    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // 클라이언트 JS에서 읽을 수 있어야 함
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    // 이후 같은 요청 사이클에서 Guard가 읽을 수 있도록 req.cookies에도 반영
    if (!req.cookies) {
      (req as Request & { cookies: Record<string, string> }).cookies = {};
    }
    (req.cookies as Record<string, string>)[CSRF_COOKIE_NAME] = token;

    next();
  }
}
