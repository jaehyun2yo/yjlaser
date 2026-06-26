import { NextRequest } from 'next/server';
import { parseBody, proxyToNestJS } from '@/lib/api/webhard-proxy';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await parseBody(request);
  return proxyToNestJS(request, `/trash/${id}`, { method: 'DELETE', body });
}
