/**
 * Webhard Files API Route
 * NestJS 백엔드로 프록시하여 파일 목록을 조회합니다.
 *
 * GET /api/webhard/files - 파일 목록 조회
 *
 * Query params:
 * - folderId: 폴더 ID (없으면 루트)
 * - companyId: 업체 ID (관리자 필터링용)
 * - page: 페이지 번호 (기본값: 1)
 * - limit: 페이지당 항목 수 (기본값: 50)
 * - sortBy: 정렬 기준 (name, date, size - 기본값: date)
 * - sortOrder: 정렬 순서 (asc, desc - 기본값: desc)
 */

import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/files', { searchParams });
}
