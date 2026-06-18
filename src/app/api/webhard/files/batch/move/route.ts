import { NextRequest } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';
import { validateBatchMove } from '@/lib/utils/webhardValidation';

export async function POST(request: NextRequest) {
  const body = await parseBody(request);

  // 입력값 검증
  const validation = validateBatchMove(body);
  if (!validation.valid) {
    return validation.response!;
  }

  // 검증된 데이터로 프록시 요청
  return proxyToNestJS(request, '/files/batch/move', { body: validation.data });
}
