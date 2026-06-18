import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/search
 * 통합 검색 (파일 + 폴더) - NestJS 백엔드로 프록시
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/search', { searchParams });
}
