import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse, ValidationError } from '@/lib/utils/errors';
import { serverUpdateContactStatus } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const statusApiLogger = logger.createLogger('STATUS_API');

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    // Actor 정보 추출
    const actorType = auth.user.userType;
    const actorName = auth.user.userId ? String(auth.user.userId) : 'unknown';

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (
      !status ||
      ![
        'received',
        'drawing',
        'confirmed',
        'production',
        'cutting',
        'finishing',
        'delivered',
        'on_hold',
      ].includes(status)
    ) {
      const errorResponse = toApiErrorResponse(new ValidationError('유효하지 않은 상태 값입니다.'));
      return NextResponse.json(errorResponse.body, { status: errorResponse.status });
    }

    const result = await serverUpdateContactStatus(id, status, { actorType, actorName });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    statusApiLogger.error('Exception in PATCH contact status', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
