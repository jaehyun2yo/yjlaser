import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/settings
 * 사용자 설정 조회 - NestJS 백엔드로 프록시
 */
export async function GET(request: NextRequest) {
  return proxyToNestJS(request, '/settings');
}

/**
 * POST /api/webhard/settings
 * 사용자 설정 저장 - NestJS 백엔드로 프록시
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  return proxyToNestJS(request, '/settings', { method: 'POST', body });
}

/**
 * PUT /api/webhard/settings
 * 사용자 설정 부분 업데이트 - NestJS 백엔드로 프록시
 */
export async function PUT(request: NextRequest) {
  return POST(request);
}
