import { NextRequest } from 'next/server';
import { proxyToNestJS } from '@/lib/api/webhard-proxy';

/**
 * GET /api/webhard/folders/[id]/ancestors
 * 폴더의 조상(상위) 폴더 목록 조회 - NestJS 백엔드로 프록시
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToNestJS(request, `/folders/${id}/ancestors`);
}
