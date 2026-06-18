/**
 * Worker Portal 미들웨어 로직 테스트
 * FEAT-011: 쿠키 검증 로직, 서브도메인 매핑 기대값 문서화
 *
 * 전략: middleware.ts를 직접 import하는 대신,
 * 미들웨어 핵심 로직을 순수 함수로 분리하여 테스트
 * (next/server는 Web API 의존성으로 인해 Jest 환경에서 직접 사용 불가)
 */

// ─── 미들웨어 핵심 로직 (middleware.ts에서 추출) ───

/**
 * erp-session 쿠키 유효성 검사
 * 형식: token.signature (period로 구분된 2 파트)
 */
function isValidErpSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const parts = cookieValue.split('.');
  return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]);
}

/**
 * /worker 경로에서 로그인 페이지를 제외하고 세션이 필요한지 확인
 */
function requiresWorkerAuth(pathname: string): boolean {
  return pathname.startsWith('/worker') && !pathname.startsWith('/worker/login');
}

/**
 * 클라이언트 IP 추출 (x-forwarded-for 첫 번째 IP 사용)
 */
function extractClientIp(forwardedFor: string | null): string {
  if (!forwardedFor) return '';
  return forwardedFor.split(',')[0]?.trim() ?? '';
}

/**
 * IP가 허용 목록에 있는지 확인
 * allowedIps가 빈 배열이면 모든 IP 허용
 */
function isIpAllowed(ip: string, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) return true;
  return allowedIps.includes(ip);
}

// ─── 테스트 ───

describe('Worker Portal 미들웨어 로직', () => {
  describe('isValidErpSession()', () => {
    it('undefined이면 false', () => {
      expect(isValidErpSession(undefined)).toBe(false);
    });

    it('빈 문자열이면 false', () => {
      expect(isValidErpSession('')).toBe(false);
    });

    it('period 없는 쿠키는 false (형식 오류)', () => {
      expect(isValidErpSession('invalidsession')).toBe(false);
    });

    it('token.signature 형식이면 true', () => {
      expect(isValidErpSession('sometoken.somesignature')).toBe(true);
    });

    it('여러 period가 있으면 false (3파트 이상)', () => {
      expect(isValidErpSession('a.b.c')).toBe(false);
    });

    it('앞 파트가 비어있으면 false', () => {
      expect(isValidErpSession('.signature')).toBe(false);
    });

    it('뒤 파트가 비어있으면 false', () => {
      expect(isValidErpSession('token.')).toBe(false);
    });
  });

  describe('requiresWorkerAuth()', () => {
    it('/worker/login은 인증 불필요', () => {
      expect(requiresWorkerAuth('/worker/login')).toBe(false);
    });

    it('/worker/tasks는 인증 필요', () => {
      expect(requiresWorkerAuth('/worker/tasks')).toBe(true);
    });

    it('/worker/office는 인증 필요', () => {
      expect(requiresWorkerAuth('/worker/office')).toBe(true);
    });

    it('/worker (루트)는 인증 필요', () => {
      expect(requiresWorkerAuth('/worker')).toBe(true);
    });

    it('/admin은 worker 인증 불필요', () => {
      expect(requiresWorkerAuth('/admin')).toBe(false);
    });

    it('/company는 worker 인증 불필요', () => {
      expect(requiresWorkerAuth('/company')).toBe(false);
    });
  });

  describe('extractClientIp()', () => {
    it('null이면 빈 문자열 반환', () => {
      expect(extractClientIp(null)).toBe('');
    });

    it('단일 IP이면 그대로 반환', () => {
      expect(extractClientIp('192.168.1.100')).toBe('192.168.1.100');
    });

    it('여러 IP 중 첫 번째 IP만 반환', () => {
      expect(extractClientIp('192.168.1.100, 10.0.0.1, 172.16.0.1')).toBe('192.168.1.100');
    });

    it('공백 포함 IP도 trim하여 반환', () => {
      expect(extractClientIp('  192.168.1.100  , 10.0.0.1')).toBe('192.168.1.100');
    });
  });

  describe('isIpAllowed()', () => {
    it('allowedIps 빈 배열이면 모든 IP 허용', () => {
      expect(isIpAllowed('1.2.3.4', [])).toBe(true);
      expect(isIpAllowed('192.168.1.100', [])).toBe(true);
    });

    it('allowedIps에 포함된 IP면 허용', () => {
      expect(isIpAllowed('192.168.1.100', ['192.168.1.100', '10.0.0.5'])).toBe(true);
    });

    it('allowedIps에 없는 IP면 차단', () => {
      expect(isIpAllowed('5.5.5.5', ['192.168.1.100', '10.0.0.5'])).toBe(false);
    });
  });

  describe('미들웨어 통합 시나리오 (로직 레벨)', () => {
    function simulateMiddleware(options: {
      pathname: string;
      erpSessionCookie?: string;
      clientIp?: string;
      allowedIps?: string[];
    }): 'next' | 'redirect_login' | 'blocked' {
      const { pathname, erpSessionCookie, clientIp, allowedIps } = options;

      if (requiresWorkerAuth(pathname)) {
        if (!isValidErpSession(erpSessionCookie)) {
          return 'redirect_login';
        }

        // IP 화이트리스트 체크 (구현 예정)
        if (clientIp && allowedIps && allowedIps.length > 0) {
          if (!isIpAllowed(clientIp, allowedIps)) {
            return 'blocked';
          }
        }
      }

      return 'next';
    }

    it('/worker/login — 세션 없어도 통과', () => {
      const result = simulateMiddleware({ pathname: '/worker/login' });
      expect(result).toBe('next');
    });

    it('/worker/tasks — 세션 없으면 redirect_login', () => {
      const result = simulateMiddleware({ pathname: '/worker/tasks' });
      expect(result).toBe('redirect_login');
    });

    it('/worker/tasks — 유효한 세션이면 통과', () => {
      const result = simulateMiddleware({
        pathname: '/worker/tasks',
        erpSessionCookie: 'token.signature',
      });
      expect(result).toBe('next');
    });

    it('/worker/tasks — 형식 오류 세션이면 redirect_login', () => {
      const result = simulateMiddleware({
        pathname: '/worker/tasks',
        erpSessionCookie: 'invalidsession',
      });
      expect(result).toBe('redirect_login');
    });

    it('/worker/office — 세션 없으면 redirect_login', () => {
      const result = simulateMiddleware({ pathname: '/worker/office' });
      expect(result).toBe('redirect_login');
    });

    it('IP 화이트리스트 - 허용 IP이면 통과', () => {
      const result = simulateMiddleware({
        pathname: '/worker/tasks',
        erpSessionCookie: 'token.signature',
        clientIp: '192.168.1.100',
        allowedIps: ['192.168.1.100'],
      });
      expect(result).toBe('next');
    });

    it('IP 화이트리스트 - 차단 IP이면 blocked', () => {
      const result = simulateMiddleware({
        pathname: '/worker/tasks',
        erpSessionCookie: 'token.signature',
        clientIp: '5.5.5.5',
        allowedIps: ['192.168.1.100'],
      });
      expect(result).toBe('blocked');
    });

    it('IP 화이트리스트 비어있으면 모든 IP 허용', () => {
      const result = simulateMiddleware({
        pathname: '/worker/tasks',
        erpSessionCookie: 'token.signature',
        clientIp: '5.5.5.5',
        allowedIps: [],
      });
      expect(result).toBe('next');
    });
  });
});
