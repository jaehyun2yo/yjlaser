import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/utils/logger';
import crypto from 'crypto';
import { serverUpdateContactProcessStage } from '@/lib/api/nestjs-server-client';

const processStageLogger = logger.createLogger('PROCESS_STAGE_API');

const VALID_STAGES = [
  null,
  'drawing',
  'sample',
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
  'delivery',
] as const;

type ValidStage = (typeof VALID_STAGES)[number];

function isValidStage(stage: unknown): stage is ValidStage {
  return stage === null || VALID_STAGES.includes(stage as ValidStage);
}

/**
 * API Key 또는 관리자 세션 인증
 */
async function authenticate(
  request: NextRequest
): Promise<{ authorized: boolean; response?: NextResponse }> {
  const apiKey = request.headers.get('X-API-Key');
  const validApiKey = process.env.MIGRATION_API_KEY;

  if (apiKey && validApiKey) {
    try {
      const keyBuffer = Buffer.from(apiKey);
      const validBuffer = Buffer.from(validApiKey);
      if (
        keyBuffer.length === validBuffer.length &&
        crypto.timingSafeEqual(keyBuffer, validBuffer)
      ) {
        return { authorized: true };
      }
    } catch {
      // fall through
    }
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Invalid API key' }, { status: 401 }),
    };
  }

  const guardResult = await requireAdmin();
  if (!guardResult.authorized) {
    return { authorized: false, response: guardResult.response };
  }
  return { authorized: true };
}

/**
 * PATCH /api/admin/contacts/[id]/process-stage
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticate(request);
    if (!auth.authorized) return auth.response!;

    const { id } = await params;

    const body = await request.json();
    const { process_stage } = body;

    if (!isValidStage(process_stage)) {
      return NextResponse.json(
        {
          error: `Invalid process_stage. Must be one of: ${VALID_STAGES.map((s) => String(s)).join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await serverUpdateContactProcessStage(id, process_stage);

    if (!result.success) {
      processStageLogger.error('process_stage 업데이트 실패:', { error: result.error });
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    processStageLogger.info(
      `Contact ${id} process_stage: ${result.data?.previous_stage} → ${process_stage}`
    );

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    processStageLogger.error('process-stage API 오류:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
