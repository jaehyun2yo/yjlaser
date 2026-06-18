/**
 * Webhard Folder Tree API Route
 * GET /api/webhard/folders/tree - 명시 전체 폴더 트리 조회
 */

import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/folders/tree', { searchParams });
}
