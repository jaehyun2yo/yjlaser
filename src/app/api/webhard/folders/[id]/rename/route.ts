import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody(request);
  return proxyToNestJS(request, `/folders/${id}/rename`, { body });
}
