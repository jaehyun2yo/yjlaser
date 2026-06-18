import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/badge-counts
 * 미다운로드 파일 배지 카운트 조회 - NestJS 백엔드로 프록시
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/files/badge-counts', { searchParams });
}
