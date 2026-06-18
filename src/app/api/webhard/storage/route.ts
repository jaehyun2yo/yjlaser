import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/storage
 * 저장 공간 사용량 조회 - NestJS 백엔드로 프록시
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/storage', { searchParams });
}
