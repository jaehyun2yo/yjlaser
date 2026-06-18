/**
 * R2 Multipart Upload 유틸리티
 *
 * 대용량 파일(100MB+)을 청크로 나누어 안정적으로 업로드
 * - 네트워크 중단 시 재시도 가능
 * - 병렬 업로드로 속도 향상
 * - 진행률 추적 지원
 */

import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client } from './client';

// ============================================================================
// 설정
// ============================================================================

// 기본 청크 크기: 10MB (R2 최소 5MB, 최대 5GB)
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// 대용량 파일 기준: 100MB 이상이면 Multipart 사용
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB

// 최대 동시 업로드 파트 수
const MAX_CONCURRENT_UPLOADS = 4;

// Presigned URL 만료 시간
const PRESIGN_EXPIRES_IN = 3600; // 1시간

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME is not configured');
  return bucket;
}

function getPublicBaseUrl(): string {
  const url = process.env.R2_PUBLIC_BASE_URL;
  if (!url) throw new Error('R2_PUBLIC_BASE_URL is not configured');
  return url.replace(/\/$/, '');
}

// ============================================================================
// 타입 정의
// ============================================================================

export interface MultipartUploadInit {
  uploadId: string;
  objectKey: string;
  bucket: string;
  totalParts: number;
  chunkSize: number;
  publicUrl: string;
}

export interface PartUploadUrl {
  partNumber: number;
  presignedUrl: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface MultipartUploadResult {
  success: boolean;
  objectKey?: string;
  publicUrl?: string;
  error?: string;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 파일이 Multipart 업로드 대상인지 확인
 */
export function shouldUseMultipart(fileSize: number): boolean {
  return fileSize >= MULTIPART_THRESHOLD;
}

/**
 * 청크 개수 계산
 */
export function calculateParts(fileSize: number, chunkSize: number = DEFAULT_CHUNK_SIZE): number {
  return Math.ceil(fileSize / chunkSize);
}

/**
 * 고유 Object Key 생성
 */
export function generateObjectKey(fileName: string, folder: string = 'webhard'): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
  return `${folder}/${timestamp}-${randomId}-${sanitizedFileName}`;
}

// ============================================================================
// Multipart Upload API (서버용)
// ============================================================================

/**
 * 1단계: Multipart Upload 초기화
 *
 * @param fileName 원본 파일명
 * @param contentType MIME 타입
 * @param fileSize 파일 크기 (bytes)
 * @param folder 저장 폴더 (기본: webhard)
 * @param chunkSize 청크 크기 (기본: 10MB)
 */
export async function initMultipartUpload(
  fileName: string,
  contentType: string,
  fileSize: number,
  folder: string = 'webhard',
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<MultipartUploadInit> {
  const s3 = getR2Client();
  const bucket = getBucket();
  const objectKey = generateObjectKey(fileName, folder);
  const totalParts = calculateParts(fileSize, chunkSize);

  const command = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  const response = await s3.send(command);

  if (!response.UploadId) {
    throw new Error('Failed to initiate multipart upload: no UploadId returned');
  }

  return {
    uploadId: response.UploadId,
    objectKey,
    bucket,
    totalParts,
    chunkSize,
    publicUrl: `${getPublicBaseUrl()}/${objectKey}`,
  };
}

/**
 * 2단계: 파트별 Presigned URL 생성
 *
 * @param uploadId Multipart Upload ID
 * @param objectKey Object Key
 * @param partNumbers 파트 번호 배열 (1-based)
 */
export async function generatePartUploadUrls(
  uploadId: string,
  objectKey: string,
  partNumbers: number[]
): Promise<PartUploadUrl[]> {
  const s3 = getR2Client();
  const bucket = getBucket();

  const urls = await Promise.all(
    partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presignedUrl = await getSignedUrl(s3 as any, command as any, {
        expiresIn: PRESIGN_EXPIRES_IN,
      });

      return { partNumber, presignedUrl };
    })
  );

  return urls;
}

/**
 * 3단계: Multipart Upload 완료
 *
 * @param uploadId Multipart Upload ID
 * @param objectKey Object Key
 * @param parts 완료된 파트 목록 (ETag 포함)
 */
export async function completeMultipartUpload(
  uploadId: string,
  objectKey: string,
  parts: CompletedPart[]
): Promise<MultipartUploadResult> {
  const s3 = getR2Client();
  const bucket = getBucket();

  // 파트 번호순 정렬 (필수)
  const sortedParts = [...parts].sort((a, b) => a.partNumber - b.partNumber);

  const command = new CompleteMultipartUploadCommand({
    Bucket: bucket,
    Key: objectKey,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: sortedParts.map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag,
      })),
    },
  });

  try {
    await s3.send(command);

    return {
      success: true,
      objectKey,
      publicUrl: `${getPublicBaseUrl()}/${objectKey}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Multipart Upload 취소 (실패 시 정리용)
 */
export async function abortMultipartUpload(uploadId: string, objectKey: string): Promise<void> {
  const s3 = getR2Client();
  const bucket = getBucket();

  const command = new AbortMultipartUploadCommand({
    Bucket: bucket,
    Key: objectKey,
    UploadId: uploadId,
  });

  await s3.send(command);
}

// ============================================================================
// 단일 요청 Presigned URL (소용량 파일용)
// ============================================================================

/**
 * 단일 PUT 요청용 Presigned URL 생성 (100MB 미만 파일)
 */
export async function generateSimplePresignedUrl(
  fileName: string,
  contentType: string,
  folder: string = 'webhard'
): Promise<{ presignedUrl: string; objectKey: string; publicUrl: string }> {
  const s3 = getR2Client();
  const bucket = getBucket();
  const objectKey = generateObjectKey(fileName, folder);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presignedUrl = await getSignedUrl(s3 as any, command as any, {
    expiresIn: PRESIGN_EXPIRES_IN,
  });

  return {
    presignedUrl,
    objectKey,
    publicUrl: `${getPublicBaseUrl()}/${objectKey}`,
  };
}

// ============================================================================
// 서버 사이드 직접 업로드 (동기화 프로그램용)
// ============================================================================

/**
 * 서버 사이드에서 직접 Multipart Upload 수행
 * (동기화 프로그램처럼 서버에서 Buffer를 직접 업로드할 때 사용)
 *
 * @param buffer 파일 버퍼
 * @param fileName 파일명
 * @param contentType MIME 타입
 * @param folder 저장 폴더
 * @param onProgress 진행률 콜백 (0-100)
 */
export async function uploadLargeBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  folder: string = 'webhard',
  onProgress?: (percent: number) => void
): Promise<MultipartUploadResult> {
  const fileSize = buffer.length;
  const chunkSize = DEFAULT_CHUNK_SIZE;

  // 소용량 파일은 단일 업로드
  if (!shouldUseMultipart(fileSize)) {
    return uploadSmallBuffer(buffer, fileName, contentType, folder);
  }

  const s3 = getR2Client();
  const bucket = getBucket();

  // 1. Multipart 초기화
  const initResult = await initMultipartUpload(fileName, contentType, fileSize, folder, chunkSize);

  const { uploadId, objectKey, totalParts } = initResult;
  const completedParts: CompletedPart[] = [];

  try {
    // 2. 청크별 업로드
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunk = buffer.subarray(start, end);

      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: chunk,
      });

      const response = await s3.send(command);

      if (response.ETag) {
        completedParts.push({
          partNumber,
          etag: response.ETag,
        });
      }

      // 진행률 콜백
      if (onProgress) {
        const percent = Math.round((partNumber / totalParts) * 100);
        onProgress(percent);
      }
    }

    // 3. 완료
    return completeMultipartUpload(uploadId, objectKey, completedParts);
  } catch (error) {
    // 실패 시 정리
    await abortMultipartUpload(uploadId, objectKey).catch(() => {});

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 소용량 파일 직접 업로드 (100MB 미만)
 */
async function uploadSmallBuffer(
  buffer: Buffer,
  fileName: string,
  contentType: string,
  folder: string = 'webhard'
): Promise<MultipartUploadResult> {
  const s3 = getR2Client();
  const bucket = getBucket();
  const objectKey = generateObjectKey(fileName, folder);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType,
  });

  try {
    await s3.send(command);

    return {
      success: true,
      objectKey,
      publicUrl: `${getPublicBaseUrl()}/${objectKey}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// 스트림 기반 업로드 (대용량 파일 메모리 효율화)
// ============================================================================

import { Readable } from 'stream';

/**
 * 스트림에서 청크 단위로 읽기
 */
async function readChunkFromStream(stream: Readable, size: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const remaining = size - bytesRead;
      if (chunk.length <= remaining) {
        chunks.push(chunk);
        bytesRead += chunk.length;
      } else {
        // 청크가 필요한 양보다 크면 분할
        chunks.push(chunk.subarray(0, remaining));
        bytesRead = size;
        // 나머지는 다시 스트림에 푸시
        stream.unshift(chunk.subarray(remaining));
      }

      if (bytesRead >= size) {
        stream.removeListener('data', onData);
        stream.removeListener('end', onEnd);
        stream.removeListener('error', onError);
        resolve(Buffer.concat(chunks));
      }
    };

    const onEnd = () => {
      stream.removeListener('data', onData);
      stream.removeListener('error', onError);
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
    };

    const onError = (err: Error) => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      reject(err);
    };

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

/**
 * 스트림 기반 Multipart Upload (메모리 효율적)
 *
 * @param stream 읽기 스트림
 * @param fileName 파일명
 * @param contentType MIME 타입
 * @param fileSize 파일 크기 (알고 있는 경우)
 * @param folder 저장 폴더
 * @param onProgress 진행률 콜백
 */
export async function uploadStreamMultipart(
  stream: Readable,
  fileName: string,
  contentType: string,
  fileSize: number,
  folder: string = 'webhard',
  onProgress?: (percent: number) => void
): Promise<MultipartUploadResult> {
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const s3 = getR2Client();
  const bucket = getBucket();

  // Multipart 초기화
  const initResult = await initMultipartUpload(fileName, contentType, fileSize, folder, chunkSize);

  const { uploadId, objectKey, totalParts } = initResult;
  const completedParts: CompletedPart[] = [];
  let partNumber = 1;
  let uploadedBytes = 0;

  try {
    // 스트림에서 청크 단위로 읽어서 업로드
    while (true) {
      const chunk = await readChunkFromStream(stream, chunkSize);
      if (!chunk) break;

      const command = new UploadPartCommand({
        Bucket: bucket,
        Key: objectKey,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: chunk,
      });

      const response = await s3.send(command);

      if (response.ETag) {
        completedParts.push({
          partNumber,
          etag: response.ETag,
        });
      }

      uploadedBytes += chunk.length;
      partNumber++;

      if (onProgress && fileSize > 0) {
        const percent = Math.round((uploadedBytes / fileSize) * 100);
        onProgress(Math.min(percent, 100));
      }
    }

    // 완료
    return completeMultipartUpload(uploadId, objectKey, completedParts);
  } catch (error) {
    await abortMultipartUpload(uploadId, objectKey).catch(() => {});

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// 상수 Export
// ============================================================================

export const MULTIPART_CONFIG = {
  DEFAULT_CHUNK_SIZE,
  MULTIPART_THRESHOLD,
  MAX_CONCURRENT_UPLOADS,
  PRESIGN_EXPIRES_IN,
} as const;
