import { requireAdmin } from '@/lib/auth/adminGuard';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse, ValidationError } from '@/lib/utils/errors';
import { serverUpdateContactInquiryType } from '@/lib/api/nestjs-server-client';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import type { InquiryType } from '@/lib/types';

const inquiryTypeApiLogger = logger.createLogger('INQUIRY_TYPE_API');

const VALID_INQUIRY_TYPES: InquiryType[] = ['cutting_request', 'mold_request'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const workerSession = await getErpWorkerSession();
    let actor: { actorType: string; actorName: string };

    if (workerSession) {
      actor = { actorType: 'worker', actorName: workerSession.workerName };
    } else {
      const guardResult = await requireAdmin();
      if (!guardResult.authorized) {
        return guardResult.response;
      }
      actor = { actorType: 'admin', actorName: 'admin' };
    }

    const { id } = await params;
    const body = await request.json();
    const { inquiry_type } = body as { inquiry_type: InquiryType };

    if (!inquiry_type || !VALID_INQUIRY_TYPES.includes(inquiry_type)) {
      const errorResponse = toApiErrorResponse(
        new ValidationError(
          '유효하지 않은 inquiry_type 값입니다. cutting_request 또는 mold_request만 허용됩니다.'
        )
      );
      return NextResponse.json(errorResponse.body, { status: errorResponse.status });
    }

    const result = await serverUpdateContactInquiryType(id, inquiry_type, actor);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    inquiryTypeApiLogger.info('inquiry_type updated', { contactId: id, inquiry_type });
    return NextResponse.json({ success: true, contact: result.data });
  } catch (error) {
    inquiryTypeApiLogger.error('Exception in PATCH inquiry-type', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
