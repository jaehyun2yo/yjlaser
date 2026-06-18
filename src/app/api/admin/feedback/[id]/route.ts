import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse, ValidationError } from '@/lib/utils/errors';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { nestjsFetch, serverUpdateFeedback } from '@/lib/api/nestjs-server-client';

const feedbackApiLogger = logger.createLogger('ADMIN_FEEDBACK_API');

/**
 * DELETE /api/admin/feedback/[id]
 * 불편사항 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 관리자 권한 검사
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const { id } = await params;
    const feedbackId = parseInt(id, 10);

    if (isNaN(feedbackId)) {
      const errorResponse = toApiErrorResponse(new Error('Invalid feedback ID'));
      return NextResponse.json(errorResponse.body, { status: 400 });
    }

    // 불편사항 삭제 (NestJS API)
    const response = await nestjsFetch(`/feedback/${feedbackId}`, {
      method: 'DELETE',
      useApiKey: true,
    });

    if (!response.ok) {
      feedbackApiLogger.error('Error deleting feedback', { feedbackId, status: response.status });
      return NextResponse.json({ error: 'Failed to delete feedback' }, { status: 500 });
    }

    feedbackApiLogger.info('Feedback deleted successfully', { feedbackId });
    return NextResponse.json({ success: true });
  } catch (error) {
    feedbackApiLogger.error('Exception in DELETE feedback', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}

/**
 * PATCH /api/admin/feedback/[id]
 * 불편사항 상태 업데이트
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 관리자 권한 검사
    const guardResult = await requireAdmin();
    if (!guardResult.authorized) {
      return guardResult.response;
    }

    const { id } = await params;
    const feedbackId = parseInt(id, 10);

    if (isNaN(feedbackId)) {
      const errorResponse = toApiErrorResponse(new Error('Invalid feedback ID'));
      return NextResponse.json(errorResponse.body, { status: 400 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['pending', 'in_progress', 'resolved', 'closed'].includes(status)) {
      const errorResponse = toApiErrorResponse(new ValidationError('유효하지 않은 상태 값입니다.'));
      return NextResponse.json(errorResponse.body, { status: 400 });
    }

    // 불편사항 상태 업데이트 (NestJS API)
    const result = await serverUpdateFeedback(feedbackId, { status });

    if (!result.success) {
      feedbackApiLogger.error('Error updating feedback status', {
        feedbackId,
        status,
        error: result.error,
      });
      return NextResponse.json({ error: result.error || 'Failed to update' }, { status: 500 });
    }

    feedbackApiLogger.info('Feedback status updated successfully', { feedbackId, status });
    return NextResponse.json({ success: true });
  } catch (error) {
    feedbackApiLogger.error('Exception in PATCH feedback status', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
  }
}
