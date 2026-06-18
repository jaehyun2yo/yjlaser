import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { buildWorkerSessionHeaders } from '@/app/api/worker/_lib/workerSessionHeaders';

const log = logger.createLogger('WorkerDrawingUploadUrls');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const GOOGLE_DRIVE_UPLOAD_PROXY_URL = `${NESTJS_API_URL}/api/v1/files/google-drive/upload`;
const GOOGLE_DRIVE_UPLOAD_URL_HEADER = 'X-Google-Drive-Upload-Url';

interface DrawingRevisionUploadUrl {
  uploadUrl: string;
  key: string;
  fileName: string;
  provider?: 'R2' | 'GOOGLE_DRIVE' | 'r2' | 'google_drive';
  driveFileId?: string;
  uploadHeaders?: Record<string, string>;
}

/**
 * POST /api/worker/drawing-revisions/upload-urls
 * Worker 도면 업로드용 presigned URL 발급
 * erp-session 쿠키로 인증합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getErpWorkerSession();
    if (!session) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { contactId, files } = body as {
      contactId: string;
      files: Array<{ name: string; mimeType: string; size?: number }>;
    };

    if (!contactId || !Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'contactId와 files가 필요합니다.' }, { status: 400 });
    }

    const response = await fetch(
      `${NESTJS_API_URL}/api/v1/contacts/${encodeURIComponent(contactId)}/drawing-revisions/upload-urls`,
      {
        method: 'POST',
        headers: buildWorkerSessionHeaders(request),
        body: JSON.stringify({ files }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Upload URL 발급 실패' }));
      log.error('NestJS upload-urls error', { status: response.status, error: errorData });
      return NextResponse.json(
        { error: (errorData as Record<string, string>).message || 'Upload URL 발급 실패' },
        { status: response.status }
      );
    }

    const data = (await response.json()) as DrawingRevisionUploadUrl[];
    return NextResponse.json(data.map(toBrowserUploadUrl));
  } catch (error) {
    log.error('Worker drawing upload-urls error', error);
    return NextResponse.json({ error: 'Upload URL 발급 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

function toBrowserUploadUrl(uploadUrl: DrawingRevisionUploadUrl): DrawingRevisionUploadUrl {
  const isGoogleDrive =
    uploadUrl.provider === 'GOOGLE_DRIVE' || uploadUrl.provider === 'google_drive';
  if (!isGoogleDrive) return uploadUrl;

  return {
    ...uploadUrl,
    uploadUrl: GOOGLE_DRIVE_UPLOAD_PROXY_URL,
    uploadHeaders: {
      ...(uploadUrl.uploadHeaders ?? {}),
      [GOOGLE_DRIVE_UPLOAD_URL_HEADER]: uploadUrl.uploadUrl,
    },
  };
}
