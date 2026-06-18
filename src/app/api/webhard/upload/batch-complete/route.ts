import { NextRequest, NextResponse } from 'next/server';
import { proxyToNestJS, parseBody } from '@/lib/api/webhard-proxy';

interface FrontendFileConfirm {
  fileName: string;
  originalName: string;
  fileSize: number;
  folderId: string;
  objectKey: string;
  publicUrl: string;
  mimeType: string;
  storageProvider?: 'google_drive' | 'r2';
  driveFileId?: string;
  driveUploadProof?: string;
}

type BatchCompleteFileResult = {
  fileName: string;
  success: boolean;
  error?: string;
};

function getNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getStringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function getBatchResultsValue(value: unknown): BatchCompleteFileResult[] | null {
  if (!Array.isArray(value)) return null;

  const results = value.flatMap((item): BatchCompleteFileResult[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const fileName = getStringValue(record.fileName);
    const success = typeof record.success === 'boolean' ? record.success : null;
    if (!fileName || success === null) return [];
    const error = getStringValue(record.error);
    return [{ fileName, success, ...(error ? { error } : {}) }];
  });

  return results.length > 0 ? results : null;
}

function buildBatchResults(
  files: FrontendFileConfirm[],
  errors: string[],
  fallbackSuccess: boolean,
  failed: number
): BatchCompleteFileResult[] {
  const matchedErrors = files.map((f) =>
    errors.find(
      (item) =>
        item.includes(f.fileName) ||
        Boolean(f.originalName && f.originalName !== f.fileName && item.includes(f.originalName))
    )
  );
  let unmatchedFailureBudget = Math.max(
    0,
    failed - matchedErrors.filter((error): error is string => Boolean(error)).length
  );

  return files.map((f, index) => {
    const error = matchedErrors[index];
    if (error) {
      return { success: false, fileName: f.fileName, error };
    }

    if (unmatchedFailureBudget > 0) {
      unmatchedFailureBudget -= 1;
      return {
        success: false,
        fileName: f.fileName,
        error: 'Batch upload confirmation failed',
      };
    }

    return { success: fallbackSuccess, fileName: f.fileName };
  });
}

/**
 * POST /api/webhard/upload/batch-complete
 * 업로드 완료 후 메타데이터 저장 (배치)
 *
 * N+1 루프 → NestJS batch/confirm 단일 호출로 최적화
 * 9000파일: 9000 HTTP 요청 → 1 HTTP 요청 (배치당)
 */
export async function POST(request: NextRequest) {
  const body = await parseBody(request);

  if (!body || typeof body !== 'object' || !('files' in body) || !Array.isArray(body.files)) {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const files = body.files as FrontendFileConfirm[];

  // NestJS BatchConfirmUploadDto 형식으로 변환 → 단일 배치 호출
  const confirmDtos = files.map((f) => ({
    key: f.objectKey,
    name: f.fileName,
    originalName: f.originalName || f.fileName,
    size: f.fileSize,
    mimeType: f.mimeType || 'application/octet-stream',
    folderId: f.folderId || undefined,
    storageProvider: f.storageProvider,
    driveFileId: f.driveFileId,
    driveUploadProof: f.driveUploadProof,
  }));

  try {
    const response = await proxyToNestJS(request, '/files/batch/confirm', {
      method: 'POST',
      body: { files: confirmDtos },
    });

    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;
      const failed = getNumberValue(data.failed) ?? 0;
      const success = data.success === false ? 0 : (getNumberValue(data.success) ?? files.length);
      const errors = getStringArrayValue(data.errors);
      const results =
        getBatchResultsValue(data.results) ?? buildBatchResults(files, errors, success > 0, failed);

      if (data.success === false || failed > 0) {
        return NextResponse.json({
          success: false,
          error: 'Batch upload confirmation failed',
          data: {
            total: files.length,
            success,
            failed,
            results,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          total: files.length,
          success,
          failed,
          results,
        },
      });
    }

    // 배치 API 실패 시 개별 fallback
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(
      {
        success: false,
        data: {
          total: files.length,
          success: 0,
          failed: files.length,
          results: files.map((f) => ({
            success: false,
            fileName: f.fileName,
            error: getStringValue(errorData.message) ?? `HTTP ${response.status}`,
          })),
        },
      },
      { status: response.status >= 400 ? response.status : 502 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        data: {
          total: files.length,
          success: 0,
          failed: files.length,
          results: files.map((f) => ({
            success: false,
            fileName: f.fileName,
            error: errorMessage,
          })),
        },
      },
      { status: 502 }
    );
  }
}
