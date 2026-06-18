import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/files/new
 * 새 파일 목록 조회 - NestJS 백엔드로 프록시
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/files/new', { searchParams });
}
