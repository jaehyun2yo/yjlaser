import { NextRequest } from 'next/server';
import { proxyToNestJS } from '@/lib/api/webhard-proxy';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToNestJS(request, `/folders/${id}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToNestJS(request, `/folders/${id}`, { method: 'DELETE' });
}
