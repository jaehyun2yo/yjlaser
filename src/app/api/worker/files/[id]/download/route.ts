import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { buildWorkerSessionHeaders } from '@/app/api/worker/_lib/workerSessionHeaders';

const workerDownloadLogger = logger.createLogger('WorkerDownload');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

/**
 * GET /api/worker/files/:id/download
 * 작업자가 파일 다운로드 URL(presigned)을 받습니다.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({ success: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;

    // NestJS API로 프록시
    const url = `${NESTJS_API_URL}/api/v1/files/${encodeURIComponent(id)}/download`;

    const response = await fetch(url, {
      method: 'GET',
      headers: buildWorkerSessionHeaders(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Download failed' }));
      workerDownloadLogger.error('Download URL error', {
        status: response.status,
        error: errorData,
      });
      return NextResponse.json(
        { success: false, error: errorData.message || '다운로드 URL 생성 실패' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const downloadUrl =
      data.provider === 'google_drive'
        ? `/api/worker/files/${id}/download/stream`
        : data.url || data.downloadUrl;

    return NextResponse.json({
      success: true,
      url: downloadUrl,
      filename: data.filename || data.fileName,
    });
  } catch (error) {
    workerDownloadLogger.error('Worker download error', error);
    return NextResponse.json(
      { success: false, error: '다운로드 URL 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
