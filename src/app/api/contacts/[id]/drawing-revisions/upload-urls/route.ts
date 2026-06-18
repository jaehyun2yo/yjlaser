import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { toApiErrorResponse } from '@/lib/utils/errors';
import {
  serverGetContact,
  serverGetDrawingRevisionUploadUrls,
} from '@/lib/api/nestjs-server-client';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('DRAWING_REVISION_UPLOAD_URLS_API');
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
 * POST /api/contacts/[id]/drawing-revisions/upload-urls
 * 도면 업로드 presigned URL 생성
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const contact = await serverGetContact(id);
    if (!contact) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    const accessError = await requireCompanyRecordAccess(auth.user, contact);
    if (accessError) return accessError;

    const body = await request.json();
    const { files } = body as { files: Array<{ name: string; mimeType: string; size?: number }> };

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'files 배열이 필요합니다.' }, { status: 400 });
    }

    const uploadUrls = await serverGetDrawingRevisionUploadUrls(id, files);

    return NextResponse.json(uploadUrls.map(toBrowserUploadUrl));
  } catch (error) {
    log.error('Exception in POST drawing-revisions/upload-urls', error);
    const errorResponse = toApiErrorResponse(error);
    return NextResponse.json(errorResponse.body, { status: errorResponse.status });
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
