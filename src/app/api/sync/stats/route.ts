/**
 * 동기화 통계 조회 API 프록시
 *
 * 동기화 서비스의 통계 정보를 조회
 */

import { NextResponse } from 'next/server';

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://localhost:3001';

export async function GET() {
  try {
    const response = await fetch(`${SYNC_SERVICE_URL}/api/v1/stats`, {
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
