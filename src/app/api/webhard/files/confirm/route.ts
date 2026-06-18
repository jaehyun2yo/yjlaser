import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

export async function POST(request: NextRequest) {
  const body = await parseBody(request);
  return proxyToNestJS(request, '/files/confirm', { body });
}
