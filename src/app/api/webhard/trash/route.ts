import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/trash
 * 휴지통 파일 목록 조회 - NestJS 프록시
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/trash', { searchParams });
}

/**
 * DELETE /api/webhard/trash
 * 휴지통 비우기 (모든 삭제된 파일 영구 삭제) - NestJS 프록시
 */
export async function DELETE(request: NextRequest) {
  return proxyToNestJS(request, '/trash', { method: 'DELETE' });
}
