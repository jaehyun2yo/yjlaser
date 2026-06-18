import { NextRequest, NextResponse } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

// R2 공개 URL 기본값 (환경변수에서 가져옴)
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || 'https://yjlaser.net';
const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const GOOGLE_DRIVE_UPLOAD_PROXY_URL = `${NESTJS_API_URL}/api/v1/files/google-drive/upload`;
const GOOGLE_DRIVE_UPLOAD_URL_HEADER = 'X-Google-Drive-Upload-Url';

interface FrontendFileInput {
  fileName?: string;
  fileSize?: number;
  contentType?: string;
}

interface BatchUploadBody {
  folderId?: string;
  files?: FrontendFileInput[];
  createFolders?: boolean;
}

interface NestJSPresignedUrl {
  url: string;
  key: string;
  expiresAt: string;
  provider?: 'google_drive' | 'r2';
  uploadUrl?: string;
  uploadHeaders?: Record<string, string>;
  driveFileId?: string;
  folderId?: string | null;
}

/**
 * POST /api/webhard/upload/batch
 * Presigned URL 배치 발급 프록시
 *
 * 프론트엔드 형식:
 * { folderId, files: [{ fileName, fileSize, contentType }], createFolders }
 *
 * NestJS 백엔드 형식 (BatchUploadDto):
 * { files: [{ filename, contentType, size?, folderId?, companyId? }] }
 *
 * 프론트엔드 기대 응답:
 * { success: true, data: { files: [{ fileName, presignedUrl, objectKey, publicUrl, folderId, skipped }] } }
 *
 * NestJS 응답:
 * { urls: [{ url, key, expiresAt }] }
 */
export async function POST(request: NextRequest) {
  const body = await parseBody<BatchUploadBody>(request);

  // 요청 형식 변환
  if (body && Array.isArray(body.files)) {
    const folderId = body.folderId;
    const originalFiles = body.files;

    const transformedFiles = originalFiles.map((file) => ({
      filename: file.fileName,
      contentType: file.contentType || 'application/octet-stream',
      size: file.fileSize,
      folderId: folderId,
    }));

    // NestJS 백엔드 호출
    const response = await proxyToNestJS(request, '/files/batch/upload', {
      body: { files: transformedFiles },
    });

    // 에러 응답이면 그대로 반환
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { success: false, error: errorData.message || 'Failed to get presigned URLs' },
        { status: response.status }
      );
    }

    // 응답 형식 변환
    try {
      const nestJSResponse = await response.json();
      const urls: NestJSPresignedUrl[] = nestJSResponse.urls || [];

      // sanitizedFileName → originalFile 매핑 (key 기반 방어적 매칭)
      const sanitize = (name: string): string =>
        name
          .replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
          .replace(/_{2,}/g, '_')
          .substring(0, 200);

      const sanitizedMap = new Map<string, FrontendFileInput>();
      for (const file of originalFiles) {
        if (file.fileName) {
          sanitizedMap.set(sanitize(file.fileName), file);
        }
      }

      // key에서 sanitizedFilename 추출: 마지막 세그먼트의 {timestamp}-{random}- 접두사 제거
      const extractSanitizedName = (key: string): string => {
        const lastSegment = key.split('/').pop() || '';
        // 형식: {timestamp}-{random6chars}-{sanitizedFilename}
        const match = lastSegment.match(/^\d+-[a-z0-9]{1,8}-(.+)$/);
        return match ? match[1] : lastSegment;
      };

      // 프론트엔드 기대 형식으로 변환 — key의 sanitizedFilename 기반 매핑, fallback으로 index
      const transformedResponse = {
        success: true,
        data: {
          files: urls.map((urlData, index) => {
            const keyFileName = extractSanitizedName(urlData.key);
            const originalFile = sanitizedMap.get(keyFileName) ?? originalFiles[index];
            const isGoogleDriveUpload = urlData.provider === 'google_drive';
            const uploadUrl = urlData.uploadUrl || urlData.url;
            return {
              fileName: originalFile?.fileName || '',
              presignedUrl: isGoogleDriveUpload ? GOOGLE_DRIVE_UPLOAD_PROXY_URL : uploadUrl,
              uploadHeaders: isGoogleDriveUpload
                ? {
                    ...(urlData.uploadHeaders ?? {}),
                    [GOOGLE_DRIVE_UPLOAD_URL_HEADER]: uploadUrl,
                  }
                : urlData.uploadHeaders,
              objectKey: urlData.key,
              publicUrl:
                urlData.provider === 'google_drive'
                  ? `storage://google_drive/${urlData.driveFileId || urlData.key}`
                  : `${R2_PUBLIC_BASE_URL}/${urlData.key}`,
              folderId: urlData.folderId || folderId || '',
              storageProvider: urlData.provider,
              driveFileId: urlData.driveFileId,
              skipped: false,
            };
          }),
        },
      };

      return NextResponse.json(transformedResponse);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to parse backend response' },
        { status: 500 }
      );
    }
  }

  // 이미 올바른 형식이면 그대로 전달
  return proxyToNestJS(request, '/files/batch/upload', { body });
}
