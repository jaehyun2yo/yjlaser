// R2 upload utility (S3 compatible)
// Expects envs: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { getR2Client } from './client';

// ============================================================================
// 상수 정의
// ============================================================================

/** 스트림 업로드 임계값 (10MB 이상은 스트림 사용) */
const STREAM_UPLOAD_THRESHOLD = 10 * 1024 * 1024;

/** Presigned URL 만료 시간 계산용 상수 */
const PRESIGNED_URL_MIN_EXPIRY = 3600; // 1시간 (초)
const PRESIGNED_URL_MAX_EXPIRY = 3600; // 1시간 (초)
const PRESIGNED_URL_SIZE_FACTOR = 100 * 1024 * 1024; // 100MB당 1시간 추가

function buildObjectKey(filename: string, prefix: string = 'yjlaser') {
  const ext = filename.split('.').pop() || 'bin';
  const base = filename.replace(/\.[^.]+$/, '');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}/${id}-${base}.${ext}`;
}

export async function uploadFileToR2(
  file: File,
  prefix: string = 'yjlaser'
): Promise<{ key: string; url: string }> {
  try {
    const bucket = process.env.R2_BUCKET_NAME as string;
    const publicBase = process.env.R2_PUBLIC_BASE_URL as string;
    if (!bucket || !publicBase) {
      throw new Error('R2 is not configured: missing bucket or public base url');
    }
    const key = buildObjectKey(file.name, prefix);
    const ContentType = file.type || 'application/octet-stream';
    const s3 = getR2Client();

    // 🔧 메모리 최적화: 큰 파일은 스트림 기반 업로드 사용
    if (file.size > STREAM_UPLOAD_THRESHOLD) {
      // 스트림 기반 멀티파트 업로드 (메모리 효율적)
      const stream = Readable.from(streamFromFile(file));
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: bucket,
          Key: key,
          Body: stream,
          ContentType,
        },
        queueSize: 4, // 동시 파트 업로드 수
        partSize: 5 * 1024 * 1024, // 5MB 파트 크기
      });

      await upload.done();
    } else {
      // 작은 파일은 기존 방식 (단일 요청)
      const Body = Buffer.from(await file.arrayBuffer());
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body,
          ContentType,
          ACL: undefined, // R2 ignores; control via bucket policy
        })
      );
    }

    const url = `${publicBase.replace(/\/$/, '')}/${key}`;
    return { key, url };
  } catch (e) {
    throw e;
  }
}

/**
 * File 객체를 청크 단위로 스트리밍하는 제너레이터
 * @param file File 객체
 * @param chunkSize 청크 크기 (기본 1MB)
 */
async function* streamFromFile(file: File, chunkSize = 1024 * 1024): AsyncGenerator<Buffer> {
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSize);
    const buffer = Buffer.from(await chunk.arrayBuffer());
    yield buffer;
    offset += chunkSize;
  }
}

export async function uploadBufferToR2(
  buffer: Buffer,
  contentType: string,
  objectKey: string
): Promise<{ key: string; url: string }> {
  try {
    const bucket = process.env.R2_BUCKET_NAME as string;
    const publicBase = process.env.R2_PUBLIC_BASE_URL as string;
    if (!bucket || !publicBase) {
      throw new Error('R2 is not configured: missing bucket or public base url');
    }
    const s3 = getR2Client();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
      })
    );
    const url = `${publicBase.replace(/\/$/, '')}/${objectKey}`;
    return { key: objectKey, url };
  } catch (e) {
    throw e;
  }
}

export function buildVariantKeys(filename: string) {
  const ext = filename.split('.').pop() || 'jpg';
  const base = filename.replace(/\.[^.]+$/, '');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const basePath = `yjlaser/${id}-${base}`;
  return {
    thumb: `${basePath}-thumb.${ext}`,
    medium: `${basePath}-medium.${ext}`,
    original: `${basePath}-original.${ext}`,
  } as const;
}

/**
 * 파일 크기 기반 Presigned URL 만료 시간 계산
 * @param fileSize 파일 크기 (바이트)
 * @returns 만료 시간 (초) - 최대 1시간
 */
export function calculatePresignedUrlExpiry(fileSize: number): number {
  // 기본 1시간 (최대 1시간)
  const additionalHours = Math.floor(fileSize / PRESIGNED_URL_SIZE_FACTOR);
  const totalSeconds = PRESIGNED_URL_MIN_EXPIRY + additionalHours * 3600;
  return Math.min(totalSeconds, PRESIGNED_URL_MAX_EXPIRY);
}

/**
 * R2 Presigned URL 생성 (직접 업로드용)
 * 클라이언트가 서버를 거치지 않고 R2에 직접 업로드할 수 있는 URL 발급
 *
 * @param fileName 파일명
 * @param contentType MIME 타입
 * @param folder 폴더 경로 (기본: webhard)
 * @param expiresIn 만료 시간 (초) - 0이면 파일 크기 기반 자동 계산
 * @param fileSize 파일 크기 (바이트) - 만료 시간 자동 계산용
 */
export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  folder: string = 'webhard',
  expiresIn: number = 0, // 0이면 자동 계산
  fileSize: number = 0
): Promise<{ presignedUrl: string; objectKey: string; publicUrl: string; expiresIn: number }> {
  const bucket = process.env.R2_BUCKET_NAME as string;
  const publicBase = process.env.R2_PUBLIC_BASE_URL as string;

  if (!bucket || !publicBase) {
    throw new Error('R2 is not configured: missing bucket or public base url');
  }

  // 🔧 파일 크기 기반 만료 시간 자동 계산 (expiresIn이 0이거나 미지정 시)
  const actualExpiresIn = expiresIn > 0 ? expiresIn : calculatePresignedUrlExpiry(fileSize);

  // 고유한 object key 생성
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).slice(2, 10);
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, '_');
  const objectKey = `${folder}/${timestamp}-${randomId}-${sanitizedFileName}`;

  const s3 = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presignedUrl = await getSignedUrl(s3 as any, command as any, {
    expiresIn: actualExpiresIn,
  });
  const publicUrl = `${publicBase.replace(/\/$/, '')}/${objectKey}`;

  return { presignedUrl, objectKey, publicUrl, expiresIn: actualExpiresIn };
}

/**
 * 여러 파일에 대한 Presigned URL 일괄 생성
 * @param files 파일 정보 배열
 * @param folder 폴더 경로
 * @returns Presigned URL 정보 배열 (만료 시간 포함)
 */
export async function generateBatchPresignedUrls(
  files: Array<{ fileName: string; contentType: string; size: number }>,
  folder: string = 'webhard'
): Promise<
  Array<{
    fileName: string;
    presignedUrl: string;
    objectKey: string;
    publicUrl: string;
    expiresIn: number;
  }>
> {
  const results = await Promise.all(
    files.map(async (file) => {
      // 🔧 파일 크기 기반 만료 시간 자동 계산
      const { presignedUrl, objectKey, publicUrl, expiresIn } = await generatePresignedUploadUrl(
        file.fileName,
        file.contentType,
        folder,
        0, // 자동 계산
        file.size
      );
      return {
        fileName: file.fileName,
        presignedUrl,
        objectKey,
        publicUrl,
        expiresIn,
      };
    })
  );

  return results;
}
