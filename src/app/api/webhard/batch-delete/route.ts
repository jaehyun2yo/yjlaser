import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody, getSearchParams } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/batch-delete - 배치 삭제 통계 조회
 */
export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/folders/batch-delete', { searchParams });
}

/**
 * DELETE /api/webhard/batch-delete - 배치 삭제 실행
 */
export async function DELETE(request: NextRequest) {
  const body = await parseBody(request);
  return proxyToNestJS(request, '/folders/batch-delete', { method: 'DELETE', body });
}
