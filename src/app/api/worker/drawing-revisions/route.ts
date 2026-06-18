import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { buildWorkerSessionHeaders } from '@/app/api/worker/_lib/workerSessionHeaders';

const log = logger.createLogger('WorkerDrawingRevisions');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

/**
 * GET /api/worker/drawing-revisions?contactId=xxx
 * Worker가 문의의 도면 수정 이력을 조회합니다.
 * erp-session 쿠키로 인증합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ error: 'contactId가 필요합니다.' }, { status: 400 });
    }

    const response = await fetch(
      `${NESTJS_API_URL}/api/v1/contacts/${encodeURIComponent(contactId)}/drawing-revisions?includePrivate=true`,
      {
        method: 'GET',
        headers: buildWorkerSessionHeaders(request),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '도면 이력 조회 실패' }));
      log.error('NestJS drawing-revisions GET error', {
        status: response.status,
        error: errorData,
      });
      return NextResponse.json(
        { error: (errorData as Record<string, string>).message || '도면 이력 조회 실패' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    log.error('Worker drawing-revisions GET error', error);
    return NextResponse.json({ error: '도면 이력 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/worker/drawing-revisions
 * Worker가 도면 수정을 등록합니다.
 * erp-session 쿠키로 인증합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, ...revisionData } = body as {
      contactId: string;
      reason: string;
      files: Array<{ url: string; name: string; size: number; mimeType: string }>;
      source?: string;
      actorType?: string;
      actorName?: string;
    };

    if (!contactId) {
      return NextResponse.json({ error: 'contactId가 필요합니다.' }, { status: 400 });
    }

    const response = await fetch(
      `${NESTJS_API_URL}/api/v1/contacts/${encodeURIComponent(contactId)}/drawing-revisions`,
      {
        method: 'POST',
        headers: buildWorkerSessionHeaders(request),
        body: JSON.stringify({
          ...revisionData,
          actorType: 'worker',
          actorName: session.workerName,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '도면 등록 실패' }));
      log.error('NestJS drawing-revisions POST error', {
        status: response.status,
        error: errorData,
      });
      return NextResponse.json(
        { error: (errorData as Record<string, string>).message || '도면 등록 실패' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    log.error('Worker drawing-revisions POST error', error);
    return NextResponse.json({ error: '도면 등록 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
