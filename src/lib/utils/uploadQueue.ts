/**
 * 업로드 동시성 제어 및 재시도 로직
 * 브라우저 HTTP/2 기준 최적 동시 업로드 수: 8개 (안정성 최적화)
 *
 * @features
 * - 동시성 제어 (세마포어)
 * - 지수 백오프 재시도
 * - AbortController를 통한 취소 지원
 * - 대용량 파일 멀티파트 업로드 (100MB+)
 */

import { logger as loggerInstance } from '@/lib/utils/logger';

const uploadLogger = loggerInstance.createLogger('UploadQueue');

// 동시 업로드 제한 (HTTP/2 기준 최적화 - 안정성을 위해 8개로 조정)
const CONCURRENT_UPLOADS = 8;

// 재시도 설정
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1초

// 멀티파트 업로드 설정
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB 이상이면 멀티파트
const MULTIPART_PART_SIZE = 10 * 1024 * 1024; // 파트당 10MB

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

type BatchCompleteFileResult = {
  fileName?: string;
  success?: boolean;
  error?: string;
};

type BatchCompletePayload = {
  success?: boolean;
  data?: {
    success?: number;
    failed?: number;
    results?: BatchCompleteFileResult[];
  };
};

type DriveUploadProxyPayload = {
  uploadProof?: string;
};

// ============================================================================
// 업로드 취소 관리
// ============================================================================

/**
 * 업로드 취소 컨트롤러 저장소
 * 파일별 AbortController 관리
 */
const uploadAbortControllers = new Map<string, AbortController>();

/**
 * 배치 업로드 취소 컨트롤러
 */
let batchAbortController: AbortController | null = null;

/**
 * 파일별 AbortController 생성 및 저장
 */
export function createUploadAbortController(fileId: string): AbortController {
  // 기존 컨트롤러가 있으면 취소 후 제거
  const existing = uploadAbortControllers.get(fileId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  uploadAbortControllers.set(fileId, controller);
  return controller;
}

/**
 * 파일별 업로드 취소
 */
export function abortUpload(fileId: string): void {
  const controller = uploadAbortControllers.get(fileId);
  if (controller) {
    controller.abort();
    uploadAbortControllers.delete(fileId);
  }
}

/**
 * 여러 파일 업로드 취소
 */
export function abortUploads(fileIds: string[]): void {
  fileIds.forEach((id) => abortUpload(id));
}

/**
 * 모든 업로드 취소
 */
export function abortAllUploads(): void {
  uploadAbortControllers.forEach((controller) => controller.abort());
  uploadAbortControllers.clear();

  // 배치 업로드도 취소
  if (batchAbortController) {
    batchAbortController.abort();
    batchAbortController = null;
  }
}

/**
 * AbortController 정리 (업로드 완료/실패 시)
 */
export function cleanupAbortController(fileId: string): void {
  uploadAbortControllers.delete(fileId);
}

/**
 * 업로드가 취소되었는지 확인
 */
export function isUploadAborted(fileId: string): boolean {
  const controller = uploadAbortControllers.get(fileId);
  return controller?.signal.aborted ?? false;
}

/**
 * 세마포어 클래스 - 동시 실행 제어
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const next = this.waiting.shift();
      if (next) next();
    }
  }
}

/**
 * 지연 함수
 */
const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 지수 백오프 재시도 로직
 * @param uploadFn 업로드 함수
 * @param maxRetries 최대 재시도 횟수
 * @param signal AbortSignal (취소 지원)
 */
export async function uploadWithRetry(
  uploadFn: () => Promise<Response>,
  maxRetries: number = MAX_RETRIES,
  signal?: AbortSignal
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 🔧 취소 확인
    if (signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError');
    }

    try {
      const response = await uploadFn();
      return response;
    } catch (error) {
      // 취소된 경우 즉시 throw
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // 지수 백오프: 1초 -> 2초 -> 4초
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);

        // 대기 중에도 취소 확인
        await Promise.race([
          delay(retryDelay),
          new Promise<never>((_, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new DOMException('Upload cancelled', 'AbortError'));
            });
          }),
        ]).catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') {
            throw e;
          }
        });
      }
    }
  }

  throw lastError || new Error('Upload failed after retries');
}

/**
 * 동시성 제어된 업로드 실행
 * @param items 업로드할 항목들
 * @param uploadFn 업로드 함수
 * @param concurrency 동시 업로드 수
 * @param signal AbortSignal (전체 취소 지원)
 */
export async function uploadWithConcurrency<T>(
  items: T[],
  uploadFn: (item: T, index: number, signal?: AbortSignal) => Promise<void>,
  concurrency: number = CONCURRENT_UPLOADS,
  signal?: AbortSignal
): Promise<{ success: number; failed: number; cancelled: number; errors: Error[] }> {
  const semaphore = new Semaphore(concurrency);
  const errors: Error[] = [];
  let success = 0;
  let failed = 0;
  let cancelled = 0;

  await Promise.all(
    items.map(async (item, index) => {
      // 🔧 취소 확인
      if (signal?.aborted) {
        cancelled++;
        return;
      }

      await semaphore.acquire();

      // 세마포어 획득 후에도 취소 확인
      if (signal?.aborted) {
        semaphore.release();
        cancelled++;
        return;
      }

      try {
        await uploadFn(item, index, signal);
        success++;
      } catch (error) {
        // 취소된 경우
        if (error instanceof DOMException && error.name === 'AbortError') {
          cancelled++;
        } else {
          failed++;
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      } finally {
        semaphore.release();
      }
    })
  );

  return { success, failed, cancelled, errors };
}

/**
 * Presigned URL을 사용한 R2 직접 업로드
 * @param file 파일 객체
 * @param presignedUrl Presigned URL
 * @param onProgress 진행률 콜백
 * @param signal AbortSignal (취소 지원)
 */
export async function uploadToR2WithPresignedUrl(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // 🔧 AbortSignal 연결
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Upload cancelled', 'AbortError'));
      });

      // 이미 취소된 경우
      if (signal.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }
    }

    // 진행률 업데이트
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Upload timed out'));
    };

    xhr.onabort = () => {
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.timeout = 5 * 60 * 1000; // 5분 타임아웃
    xhr.send(file);
  });
}

/**
 * 멀티파트 업로드로 대용량 파일을 R2에 직접 업로드
 * 100MB 이상 파일을 10MB 파트로 분할하여 병렬 업로드
 */
async function uploadToR2Multipart(
  file: File,
  objectKey: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<void> {
  // 1. 멀티파트 업로드 시작
  const initiateRes = await fetch('/api/webhard/files/multipart/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: objectKey, contentType: file.type || 'application/octet-stream' }),
    signal,
  });
  if (!initiateRes.ok) throw new Error('멀티파트 업로드 시작 실패');
  const { uploadId } = await initiateRes.json();

  // 2. 파트 분할
  const totalParts = Math.ceil(file.size / MULTIPART_PART_SIZE);
  const completedParts: { PartNumber: number; ETag: string }[] = [];
  let uploadedBytes = 0;

  try {
    // 3. 파트별 업로드 (3개씩 병렬)
    const partConcurrency = 3;
    for (let startIdx = 0; startIdx < totalParts; startIdx += partConcurrency) {
      if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');

      const endIdx = Math.min(startIdx + partConcurrency, totalParts);
      const partPromises: Promise<void>[] = [];

      for (let i = startIdx; i < endIdx; i++) {
        const partNumber = i + 1;
        const start = i * MULTIPART_PART_SIZE;
        const end = Math.min(start + MULTIPART_PART_SIZE, file.size);
        const partBlob = file.slice(start, end);

        partPromises.push(
          (async () => {
            // Presigned URL 발급
            const presignRes = await fetch('/api/webhard/files/multipart/presign', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: objectKey, uploadId, partNumber }),
              signal,
            });
            if (!presignRes.ok) throw new Error(`파트 ${partNumber} Presigned URL 발급 실패`);
            const { url: partUrl } = await presignRes.json();

            // 파트 업로드
            const uploadRes = await fetch(partUrl, {
              method: 'PUT',
              body: partBlob,
              signal,
            });
            if (!uploadRes.ok) throw new Error(`파트 ${partNumber} 업로드 실패`);

            const etag = uploadRes.headers.get('ETag') || '';
            completedParts.push({ PartNumber: partNumber, ETag: etag });

            uploadedBytes += end - start;
            onProgress?.(Math.round((uploadedBytes / file.size) * 100));
          })()
        );
      }

      await Promise.all(partPromises);
    }

    // 4. 멀티파트 업로드 완료
    completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
    const completeRes = await fetch('/api/webhard/files/multipart/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: objectKey, uploadId, parts: completedParts }),
      signal,
    });
    if (!completeRes.ok) throw new Error('멀티파트 업로드 완료 실패');
    onProgress?.(100);
  } catch (error) {
    // 실패 시 멀티파트 업로드 취소 (정리)
    try {
      await fetch('/api/webhard/files/multipart/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: objectKey, uploadId }),
      });
    } catch {
      // abort 실패는 무시
    }
    throw error;
  }
}

/**
 * 파일 크기에 따라 일반 업로드 또는 멀티파트 업로드 선택
 */
export async function uploadToR2Smart(
  file: File,
  presignedUrl: string,
  objectKey: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (file.size >= MULTIPART_THRESHOLD) {
    return uploadToR2Multipart(file, objectKey, onProgress, signal);
  }
  return uploadToR2WithPresignedUrl(file, presignedUrl, onProgress, signal);
}

/**
 * 배치 업로드 (Presigned URL 방식)
 */
export interface BatchUploadOptions {
  folderId: string;
  onProgress?: (fileName: string, progress: number) => void;
  onFileComplete?: (fileName: string, success: boolean, error?: string) => void;
  onBatchComplete?: (result: { success: number; failed: number; cancelled: number }) => void;
  /** AbortSignal (전체 배치 취소 지원) */
  signal?: AbortSignal;
}

export interface BatchUploadResult {
  success: number;
  failed: number;
  skipped: number;
  cancelled: number;
  errors: Array<{ fileName: string; error: string }>;
}

// Vercel 제한 대응: 청크 크기 (Pro 플랜 기준 최적화)
const PRESIGNED_URL_BATCH_SIZE = 50; // 한 번에 50개씩 Presigned URL 발급

export async function uploadFilesBatch(
  files: File[],
  options: BatchUploadOptions
): Promise<BatchUploadResult> {
  const { folderId, onProgress, onFileComplete, onBatchComplete, signal } = options;

  // 🔧 취소 확인
  if (signal?.aborted) {
    return {
      success: 0,
      failed: 0,
      skipped: 0,
      cancelled: files.length,
      errors: [],
    };
  }

  const ownedBatchAbortController = signal ? null : new AbortController();
  if (ownedBatchAbortController) {
    batchAbortController = ownedBatchAbortController;
  }
  const batchSignal = signal ?? ownedBatchAbortController?.signal;

  // 1. 서버에서 Presigned URL 일괄 발급 (청킹)
  // Vercel Hobby 10초 제한 대응: 20개씩 분할 요청
  const allFileResults: Array<{
    fileName: string;
    presignedUrl?: string;
    uploadHeaders?: Record<string, string>;
    objectKey?: string;
    publicUrl?: string;
    folderId: string;
    storageProvider?: 'google_drive' | 'r2';
    driveFileId?: string;
    skipped: boolean;
    error?: string;
  }> = [];

  const chunks: File[][] = [];
  for (let i = 0; i < files.length; i += PRESIGNED_URL_BATCH_SIZE) {
    chunks.push(files.slice(i, i + PRESIGNED_URL_BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const batchResponse = await fetch('/api/webhard/upload/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId,
        files: chunk.map((file) => ({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
        })),
        createFolders: true,
      }),
      signal: batchSignal,
    });

    if (!batchResponse.ok) {
      const errorData = await batchResponse.json();
      throw new Error(errorData.error || 'Failed to get presigned URLs');
    }

    const batchData = await batchResponse.json();

    if (!batchData.success) {
      throw new Error(batchData.error || 'Batch upload initialization failed');
    }

    allFileResults.push(...batchData.data.files);
  }

  const fileResults = allFileResults;

  // 2. 스킵된 파일과 업로드할 파일 분류
  const filesToUpload: Array<{
    file: File;
    presignedUrl: string;
    uploadHeaders?: Record<string, string>;
    objectKey: string;
    publicUrl: string;
    folderId: string;
    storageProvider?: 'google_drive' | 'r2';
    driveFileId?: string;
  }> = [];

  const skippedFiles: Array<{ fileName: string; error: string }> = [];
  const errors: Array<{ fileName: string; error: string }> = [];
  const filesByName = new Map<string, File[]>();

  for (const file of files) {
    const candidates = filesByName.get(file.name) ?? [];
    candidates.push(file);
    filesByName.set(file.name, candidates);
  }

  const takeFileByName = (fileName: string): File | undefined => {
    const candidates = filesByName.get(fileName);
    if (!candidates || candidates.length === 0) {
      return undefined;
    }

    const [file, ...rest] = candidates;
    filesByName.set(fileName, rest);
    return file;
  };

  for (const result of fileResults) {
    if (result.skipped) {
      skippedFiles.push({
        fileName: result.fileName,
        error: result.error || 'Skipped',
      });
      continue;
    }

    const file = takeFileByName(result.fileName);
    if (file && result.presignedUrl && result.objectKey && result.publicUrl) {
      filesToUpload.push({
        file,
        presignedUrl: result.presignedUrl,
        uploadHeaders: result.uploadHeaders,
        objectKey: result.objectKey,
        publicUrl: result.publicUrl,
        folderId: result.folderId,
        storageProvider: result.storageProvider,
        driveFileId: result.driveFileId,
      });
    }
  }

  // 3. R2에 병렬 업로드 (동시성 제어)
  let successCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;

  const uploadedFiles: Array<{
    name: string;
    originalName: string;
    size: number;
    mimeType: string;
    path: string;
    objectKey: string;
    folderId: string;
    storageProvider?: 'google_drive' | 'r2';
    driveFileId?: string;
    driveUploadProof?: string;
  }> = [];

  await uploadWithConcurrency(
    filesToUpload,
    async (item, _index, itemSignal) => {
      const {
        file,
        presignedUrl,
        uploadHeaders,
        objectKey,
        publicUrl,
        folderId: targetFolderId,
        storageProvider,
        driveFileId,
      } = item;

      try {
        let driveUploadProof: string | undefined;

        // R2 대용량 파일은 멀티파트, Google Drive는 NestJS 스트리밍 프록시로 PUT
        if (storageProvider !== 'google_drive' && file.size >= MULTIPART_THRESHOLD) {
          await uploadToR2Multipart(
            file,
            objectKey,
            (progress) => onProgress?.(file.name, progress),
            itemSignal
          );
        } else {
          // 재시도 로직이 포함된 업로드 (취소 지원)
          const uploadResponse = await uploadWithRetry(
            async () => {
              const requestHeaders: Record<string, string> = {
                'Content-Type': file.type || 'application/octet-stream',
                ...(uploadHeaders ?? {}),
              };

              const requestOptions: RequestInit = {
                method: 'PUT',
                body: file,
                headers: requestHeaders,
                signal: itemSignal,
              };

              if (storageProvider === 'google_drive') {
                const csrfToken = getCookieValue('csrf-token');
                if (csrfToken) {
                  requestHeaders['X-CSRF-Token'] = csrfToken;
                }
                requestOptions.credentials = 'include';
              }

              const response = await fetch(presignedUrl, {
                ...requestOptions,
              });

              if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
              }

              return response;
            },
            MAX_RETRIES,
            itemSignal
          );

          if (storageProvider === 'google_drive') {
            const payload = (await uploadResponse
              .json()
              .catch(() => null)) as DriveUploadProxyPayload | null;
            driveUploadProof = payload?.uploadProof;
          }
        }

        // 진행률은 파일 바이트 업로드 완료 기준으로 갱신한다.
        // 최종 성공 여부는 metadata 저장까지 끝난 뒤 확정한다.
        onProgress?.(file.name, 100);

        // 업로드 성공 파일 기록
        uploadedFiles.push({
          name: file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_'),
          originalName: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          path: publicUrl,
          objectKey: objectKey,
          folderId: targetFolderId,
          storageProvider,
          driveFileId,
          driveUploadProof,
        });
      } catch (error) {
        // 🔧 취소와 실패 구분
        if (error instanceof DOMException && error.name === 'AbortError') {
          cancelledCount++;
          onFileComplete?.(file.name, false, 'Cancelled');
        } else {
          failedCount++;
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          errors.push({ fileName: file.name, error: errorMessage });
          onProgress?.(file.name, -1);
          onFileComplete?.(file.name, false, errorMessage);
        }
      }
    },
    CONCURRENT_UPLOADS,
    batchSignal
  );

  // 배치 AbortController 정리
  if (ownedBatchAbortController && batchAbortController === ownedBatchAbortController) {
    batchAbortController = null;
  }

  // 4. 업로드 완료된 파일들의 메타데이터 DB 저장 (청킹)
  // Vercel Hobby 10초 제한 대응: 20개씩 분할 저장
  if (uploadedFiles.length > 0) {
    const metadataChunks: (typeof uploadedFiles)[] = [];
    for (let i = 0; i < uploadedFiles.length; i += PRESIGNED_URL_BATCH_SIZE) {
      metadataChunks.push(uploadedFiles.slice(i, i + PRESIGNED_URL_BATCH_SIZE));
    }

    const MAX_METADATA_RETRIES = 2;

    for (const chunk of metadataChunks) {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= MAX_METADATA_RETRIES; attempt++) {
        try {
          const response = await fetch('/api/webhard/upload/batch-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              files: chunk.map((f) => ({
                fileName: f.name,
                originalName: f.originalName,
                fileSize: f.size,
                folderId: f.folderId,
                objectKey: f.objectKey,
                publicUrl: f.path,
                mimeType: f.mimeType,
                storageProvider: f.storageProvider,
                driveFileId: f.driveFileId,
                driveUploadProof: f.driveUploadProof,
              })),
            }),
            signal: batchSignal,
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`batch-complete failed: ${response.status} ${errorText}`);
          }

          const payload = (await response.json().catch(() => null)) as BatchCompletePayload | null;
          const results = payload?.data?.results;

          if (Array.isArray(results) && results.length > 0) {
            for (const file of chunk) {
              const result = results.find(
                (item) => item.fileName === file.name || item.fileName === file.originalName
              );

              if (result?.success === false) {
                failedCount++;
                const errorMsg = result.error ?? '메타데이터 저장 실패';
                errors.push({ fileName: file.originalName, error: errorMsg });
                onProgress?.(file.originalName, -1);
                onFileComplete?.(file.originalName, false, errorMsg);
                continue;
              }

              successCount++;
              onFileComplete?.(file.originalName, true);
            }
          } else {
            successCount += chunk.length;
            for (const file of chunk) {
              onFileComplete?.(file.originalName, true);
            }
          }

          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          uploadLogger.error(
            `batch-complete 재시도 ${attempt + 1}/${MAX_METADATA_RETRIES + 1}:`,
            lastError.message
          );
          if (attempt < MAX_METADATA_RETRIES) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      if (lastError) {
        uploadLogger.error('batch-complete 최종 실패:', lastError.message);
        failedCount += chunk.length;
        for (const file of chunk) {
          const errorMsg = `메타데이터 저장 실패: ${lastError.message}`;
          errors.push({ fileName: file.originalName, error: errorMsg });
          onProgress?.(file.originalName, -1);
          onFileComplete?.(file.originalName, false, errorMsg);
        }
      }
    }
  }

  // 5. 완료 콜백
  onBatchComplete?.({ success: successCount, failed: failedCount, cancelled: cancelledCount });

  return {
    success: successCount,
    failed: failedCount,
    skipped: skippedFiles.length,
    cancelled: cancelledCount,
    errors: [...skippedFiles, ...errors],
  };
}

/**
 * 배치 업로드용 AbortController 생성
 * 외부에서 배치 전체를 취소할 때 사용
 */
export function createBatchAbortController(): AbortController {
  if (batchAbortController) {
    batchAbortController.abort();
  }
  batchAbortController = new AbortController();
  return batchAbortController;
}

/**
 * 현재 배치 업로드 취소
 */
export function abortBatchUpload(): void {
  if (batchAbortController) {
    batchAbortController.abort();
    batchAbortController = null;
  }
}

export { CONCURRENT_UPLOADS, MAX_RETRIES };
