/**
 * 동기화 서비스 상태 조회 API 프록시
 *
 * LGU+ 동기화 서비스의 상태를 프록시하여 반환
 * 단방향 동기화: 외부 웹하드 → 로컬
 */

import { NextResponse } from 'next/server';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const response = await fetch(`${SYNC_SERVICE_URL}/api/v1/status`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Sync service responded with ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      data: {
        ...data.data,
        syncMode: 'one-way',
        direction: 'lguplus-to-local',
      },
    });
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
