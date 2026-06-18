/**
 * Webhard Folders Children API Route (지연 로딩용)
 * GET /api/webhard/folders/children?parentId=xxx
 */

import { NextRequest } from 'next/server';
import { proxyToNestJS, getSearchParams } from '@/lib/api/webhard-proxy';

export async function GET(request: NextRequest) {
  const searchParams = getSearchParams(request);
  return proxyToNestJS(request, '/folders/children', { searchParams });
}
