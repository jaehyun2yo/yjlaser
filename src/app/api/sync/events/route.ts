/**
 * 동기화 이벤트 조회 API 프록시
 *
 * 동기화 서비스의 이벤트 히스토리를 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);

    // 쿼리 파라미터 추출
    const page = searchParams.get('page') || '1';
    const limit = searchParams.get('limit') || '50';
    const status = searchParams.get('status') || '';
    const direction = searchParams.get('direction') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';

    // 쿼리 스트링 구성
    const queryParams = new URLSearchParams();
    queryParams.set('page', page);
    queryParams.set('limit', limit);
    if (status) queryParams.set('status', status);
    if (direction) queryParams.set('direction', direction);
    if (from) queryParams.set('from', from);
    if (to) queryParams.set('to', to);

    const response = await fetch(`${SYNC_SERVICE_URL}/api/v1/events?${queryParams.toString()}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Sync service responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SYNC_SERVICE_UNAVAILABLE',
          message: '동기화 서비스에 연결할 수 없습니다.',
          details: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 503 }
    );
  }
}
