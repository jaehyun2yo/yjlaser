import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { buildWorkerSessionHeaders } from '@/app/api/worker/_lib/workerSessionHeaders';

const workerFilesLogger = logger.createLogger('WorkerFiles');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

/**
 * GET /api/worker/files?folderId=xxx
 * 작업자가 webhard_folder_id로 폴더 내 파일 목록을 조회합니다.
 * erp-session 쿠키로 인증합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json(
        { success: false, error: 'folderId가 필요합니다.' },
        { status: 400 }
      );
    }

    // NestJS API로 프록시 (API Key 인증)
    const url = `${NESTJS_API_URL}/api/v1/files?folderId=${encodeURIComponent(folderId)}&limit=50`;

    const response = await fetch(url, {
      method: 'GET',
      headers: buildWorkerSessionHeaders(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to fetch files' }));
      workerFilesLogger.error('NestJS files API error', {
        status: response.status,
        error: errorData,
      });
      return NextResponse.json(
        { success: false, error: errorData.message || '파일 목록 조회 실패' },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      files: data.files || data.data || [],
      total: data.total || 0,
    });
  } catch (error) {
    workerFilesLogger.error('Worker files error', error);
    return NextResponse.json(
      { success: false, error: '파일 목록 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
