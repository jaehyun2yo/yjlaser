import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { serverAcknowledgeBadge } from '@/lib/api/nestjs-server-client';
import { requireAdminSession } from '@/app/api/_lib/route-authorization';

const apiLogger = logger.createLogger('CONTACTS_API');

/**
 * POST /api/contacts/[id]/booking-change-acknowledged
 * 예약변경 뱃지 확인 처리 (booking_changed_at을 null로 설정)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdminSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const result = await serverAcknowledgeBadge(id, 'booking_changed_at');

    if (!result.success) {
      apiLogger.error('Error acknowledging booking change', { contactId: id });
      return NextResponse.json(
        { error: '예약변경 확인 처리 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    apiLogger.info('Booking change acknowledged', { contactId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    apiLogger.error('Exception in booking-change-acknowledged', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
