import { NextRequest } from 'next/server';
import { proxyToNestJS } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/storage/breakdown
 * 저장공간 사용량 상세 분석 조회 - NestJS 프록시
 */
export async function GET(request: NextRequest) {
  return proxyToNestJS(request, '/storage/breakdown');
}
