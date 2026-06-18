/**
 * Webhard Folders API Route
 * NestJS 백엔드로 프록시하여 폴더 목록을 조회하고 생성합니다.
 *
 * GET /api/webhard/folders - 폴더 목록 조회
 * POST /api/webhard/folders - 새 폴더 생성
 *
 * Query params (GET):
 * - parentId: 부모 폴더 ID (없으면 루트)
 * - companyId: 업체 ID (관리자 필터링용)
 * - includeFileCounts: 파일 수 포함 여부 (true/false)
 *
 * Body (POST):
 * - name: 폴더 이름
 * - parentId: 부모 폴더 ID
 * - companyId: 업체 ID (관리자용)
 */

import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams, parseBody } from '@/lib/api/webhard-proxy';

export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/folders', { searchParams });
}

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  return proxyToNestJS(request, '/folders', { method: 'POST', body });
}
