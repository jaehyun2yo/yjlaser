/**
 * 대용량 파일 청크 업로드 유틸리티
 * 100MB 이상의 파일을 청크 단위로 분할하여 업로드합니다.
 */

// 청크 크기 (5MB)
const CHUNK_SIZE = 5 * 1024 * 1024;

// 최대 동시 업로드 수
const MAX_CONCURRENT_UPLOADS = 3;

// 최대 재시도 횟수
const MAX_RETRIES = 3;

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  currentChunk: number;
  totalChunks: number;
  fileName: string;
  status: 'preparing' | 'uploading' | 'completing' | 'completed' | 'error';
  error?: string;
}

export interface ChunkUploadOptions {
  file: File;
  folderId?: string | null;
  companyId?: string | null;
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (fileId: string) => void;
  onError?: (error: Error) => void;
  abortSignal?: AbortSignal;
}

interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  blob: Blob;
  uploaded: boolean;
  retries: number;
}

/**
 * 파일을 청크로 분할
 */
function splitIntoChunks(file: File): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    chunks.push({
      index: i,
      start,
      end,
      blob: file.slice(start, end),
      uploaded: false,
      retries: 0,
    });
  }

  return chunks;
}

/**
 * 청크 업로드 세션 초기화
 */
async function initializeUpload(
  file: File,
  folderId?: string | null,
  companyId?: string | null
): Promise<string> {
  const response = await fetch('/api/webhard/upload/init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      folderId,
      companyId,
      totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to initialize upload');
  }

  const data = await response.json();
  return data.uploadId;
}

/**
 * 단일 청크 업로드
 */
async function uploadChunk(
  uploadId: string,
  chunk: ChunkInfo,
  abortSignal?: AbortSignal
): Promise<void> {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('chunkIndex', chunk.index.toString());
  formData.append('chunk', chunk.blob);

  const response = await fetch('/api/webhard/upload/chunk', {
    method: 'POST',
    body: formData,
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `Failed to upload chunk ${chunk.index}`);
  }
}

/**
 * 업로드 완료 처리
 */
async function completeUpload(uploadId: string): Promise<string> {
  const response = await fetch('/api/webhard/upload/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uploadId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to complete upload');
  }

  const data = await response.json();
  return data.fileId;
}

/**
 * 청크 업로드 실행
 */
export async function uploadFileInChunks({
  file,
  folderId,
  companyId,
  onProgress,
  onComplete,
  onError,
  abortSignal,
}: ChunkUploadOptions): Promise<string> {
  const chunks = splitIntoChunks(file);
  let uploadedBytes = 0;

  const updateProgress = (status: UploadProgress['status'], error?: string) => {
    onProgress?.({
      uploadedBytes,
      totalBytes: file.size,
      percentage: Math.round((uploadedBytes / file.size) * 100),
      currentChunk: chunks.filter((c) => c.uploaded).length,
      totalChunks: chunks.length,
      fileName: file.name,
      status,
      error,
    });
  };

  try {
    // 1. 업로드 세션 초기화
    updateProgress('preparing');
    const uploadId = await initializeUpload(file, folderId, companyId);

    // 2. 청크 업로드 (동시 업로드 제한)
    updateProgress('uploading');

    const uploadQueue = [...chunks];
    const activeUploads: Promise<void>[] = [];

    while (uploadQueue.length > 0 || activeUploads.length > 0) {
      // 중단 확인
      if (abortSignal?.aborted) {
        throw new Error('Upload cancelled');
      }

      // 동시 업로드 수 제한 내에서 새 업로드 시작
      while (activeUploads.length < MAX_CONCURRENT_UPLOADS && uploadQueue.length > 0) {
        const chunk = uploadQueue.shift()!;

        const uploadPromise = (async () => {
          let lastError: Error | null = null;

          // 재시도 로직
          while (chunk.retries < MAX_RETRIES) {
            try {
              await uploadChunk(uploadId, chunk, abortSignal);
              chunk.uploaded = true;
              uploadedBytes += chunk.end - chunk.start;
              updateProgress('uploading');
              return;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error('Unknown error');
              chunk.retries++;

              // 중단된 경우 재시도 하지 않음
              if (abortSignal?.aborted) {
                throw lastError;
              }

              // 재시도 전 대기 (지수 백오프)
              if (chunk.retries < MAX_RETRIES) {
                await new Promise((resolve) =>
                  setTimeout(resolve, 1000 * Math.pow(2, chunk.retries))
                );
              }
            }
          }

          throw (
            lastError ||
            new Error(`Failed to upload chunk ${chunk.index} after ${MAX_RETRIES} retries`)
          );
        })();

        activeUploads.push(uploadPromise);
      }

      // 하나의 업로드가 완료될 때까지 대기
      if (activeUploads.length > 0) {
        const completedIndex = await Promise.race(
          activeUploads.map((p, i) =>
            p.then(
              () => i,
              () => i
            )
          )
        );
        activeUploads.splice(completedIndex, 1);
      }
    }

    // 모든 청크 업로드 확인
    const failedChunks = chunks.filter((c) => !c.uploaded);
    if (failedChunks.length > 0) {
      throw new Error(`Failed to upload ${failedChunks.length} chunks`);
    }

    // 3. 업로드 완료 처리
    updateProgress('completing');
    const fileId = await completeUpload(uploadId);

    updateProgress('completed');
    onComplete?.(fileId);

    return fileId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';
    updateProgress('error', errorMessage);
    onError?.(error instanceof Error ? error : new Error(errorMessage));
    throw error;
  }
}

/**
 * 일반 파일 업로드 (작은 파일용)
 */
export async function uploadFileDirect(
  file: File,
  folderId?: string | null,
  companyId?: string | null,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId) formData.append('folderId', folderId);
  if (companyId) formData.append('companyId', companyId);

  onProgress?.({
    uploadedBytes: 0,
    totalBytes: file.size,
    percentage: 0,
    currentChunk: 0,
    totalChunks: 1,
    fileName: file.name,
    status: 'uploading',
  });

  const response = await fetch('/api/webhard/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }

  const data = await response.json();

  onProgress?.({
    uploadedBytes: file.size,
    totalBytes: file.size,
    percentage: 100,
    currentChunk: 1,
    totalChunks: 1,
    fileName: file.name,
    status: 'completed',
  });

  return data.file.id;
}

/**
 * 파일 크기에 따라 적절한 업로드 방식 선택
 */
export async function uploadFile(
  file: File,
  options: Omit<ChunkUploadOptions, 'file'>
): Promise<string> {
  // 50MB 이상이면 청크 업로드
  const CHUNK_THRESHOLD = 50 * 1024 * 1024;

  if (file.size >= CHUNK_THRESHOLD) {
    return uploadFileInChunks({ file, ...options });
  } else {
    return uploadFileDirect(file, options.folderId, options.companyId, options.onProgress);
  }
}

/**
 * 업로드 진행률 포맷팅
 */
export function formatUploadProgress(progress: UploadProgress): string {
  const { percentage, uploadedBytes, totalBytes, status } = progress;

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  };

  switch (status) {
    case 'preparing':
      return '업로드 준비 중...';
    case 'uploading':
      return `${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)} (${percentage}%)`;
    case 'completing':
      return '업로드 완료 처리 중...';
    case 'completed':
      return '업로드 완료';
    case 'error':
      return `업로드 실패: ${progress.error}`;
    default:
      return '';
  }
}
