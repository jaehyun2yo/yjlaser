/**
 * 동기화 서비스 제어 API 프록시
 *
 * 동기화 서비스의 시작/중지/재시작을 제어
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL || 'http://localhost:3001';

type ControlAction = 'start' | 'stop' | 'restart';

interface ControlRequestBody {
  action: ControlAction;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as ControlRequestBody;
    const { action } = body;

    // 액션 유효성 검사
    if (!action || !['start', 'stop', 'restart'].includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_ACTION',
            message: "유효하지 않은 액션입니다. 'start', 'stop', 'restart' 중 하나를 지정하세요.",
          },
        },
        { status: 400 }
      );
    }

    const response = await fetch(`${SYNC_SERVICE_URL}/api/v1/control/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || {
            code: 'CONTROL_FAILED',
            message: `동기화 서비스 ${action} 실패`,
          },
        },
        { status: response.status }
      );
    }

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
