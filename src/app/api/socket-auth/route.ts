/**
 * Socket.IO 인증 토큰 발급 API
 *
 * 프로덕션에서 WebSocket이 다른 도메인(Railway)으로 연결될 때,
 * httpOnly 쿠키가 전송되지 않는 문제를 해결합니다.
 *
 * 흐름:
 *   1. 클라이언트가 이 엔드포인트 호출 (same-origin → 쿠키 전송됨)
 *   2. 서버가 세션 쿠키 검증 후 단기 토큰(5분) 발급
 *   3. 클라이언트가 Socket.IO auth 필드에 토큰 전달
 *   4. NestJS Gateway가 토큰 검증
 */
import crypto from 'crypto';
import { verifyAndGetUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { getSessionSecret } from '@/lib/utils/env';

const SOCKET_TOKEN_MAX_AGE = 5 * 60 * 1000; // 5분

export async function POST() {
  // admin-session 쿠키 검증
  const { isValid, user } = await verifyAndGetUser();

  if (!isValid || !user) {
    const workerSession = await getErpWorkerSession();
    if (!workerSession) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
      token: createSocketToken('worker', workerSession.workerId),
    });
  }

  return Response.json({
    token: createSocketToken(user.userType, String(user.userId)),
  });
}

function createSocketToken(userType: string, userId: string): string {
  const payload = JSON.stringify({
    userType,
    userId,
    exp: Date.now() + SOCKET_TOKEN_MAX_AGE,
    nonce: crypto.randomUUID(),
  });

  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const signature = hmac.digest('hex');

  return `${Buffer.from(payload).toString('base64url')}.${signature}`;
}
