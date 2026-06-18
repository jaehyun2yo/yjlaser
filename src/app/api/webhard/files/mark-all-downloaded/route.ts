import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

/**
 * POST /api/webhard/files/mark-all-downloaded
 * 모든 파일을 다운로드 완료로 표시 - NestJS 백엔드로 프록시
 * 파라미터 없이 호출하면 모든 새 파일을 다운로드 완료로 표시
 */
export async function POST(request: NextRequest) {
  const body = await parseBody<Record<string, unknown>>(request);
  // mark-all-downloaded는 기본적으로 markAll: true로 설정
  const enhancedBody = {
    markAll: true,
    ...(body ?? {}),
  };
  return proxyToNestJS(request, '/files/mark-downloaded', { method: 'POST', body: enhancedBody });
}
