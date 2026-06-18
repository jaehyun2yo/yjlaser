// R2 삭제 유틸리티 (S3 compatible)
// DeleteObjectsCommand를 사용하여 최대 1000개 파일 일괄 삭제

import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { logger } from '@/lib/utils/logger';
import { getR2Client } from './client';

const deleteLogger = logger.createLogger('R2_DELETE');

// R2/S3 한 번에 삭제 가능한 최대 개수
const MAX_BATCH_SIZE = 1000;

// 병렬 처리 시 기본 동시 실행 수
const DEFAULT_CONCURRENCY = 3;

// ============ 타입 정의 ============

export interface R2DeleteResult {
  deleted: string[];
  failed: Array<{ key: string; error: string }>;
}

// ============ 단일 파일 삭제 ============

/**
 * 단일 파일 삭제
 * @param objectKey R2 object key (예: 'webhard/12345-file.pdf')
 * @returns 성공 여부
 */
export async function deleteFromR2(objectKey: string): Promise<boolean> {
  const bucket = process.env.R2_BUCKET_NAME as string;
  if (!bucket) {
    throw new Error('R2 is not configured: missing bucket name');
  }

  try {
    const s3 = getR2Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );
    return true;
  } catch (error) {
    deleteLogger.error(`Failed to delete ${objectKey}`, error);
    return false;
  }
}

// ============ 배치 삭제 (최대 1000개) ============

/**
 * 배치 삭제 (최대 1000개)
 * R2/S3의 DeleteObjectsCommand는 한 번에 최대 1000개 삭제 가능
 *
 * @param objectKeys 삭제할 object key 배열
 * @returns 삭제 결과 (성공/실패 목록)
 */
export async function batchDeleteFromR2(objectKeys: string[]): Promise<R2DeleteResult> {
  const bucket = process.env.R2_BUCKET_NAME as string;
  if (!bucket) {
    throw new Error('R2 is not configured: missing bucket name');
  }

  if (objectKeys.length === 0) {
    return { deleted: [], failed: [] };
  }

  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  try {
    const s3 = getR2Client();

    // 1000개씩 분할 처리
    for (let i = 0; i < objectKeys.length; i += MAX_BATCH_SIZE) {
      const batch = objectKeys.slice(i, i + MAX_BATCH_SIZE);

      try {
        const response = await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: batch.map((key) => ({ Key: key })),
              Quiet: false, // 삭제 결과 반환
            },
          })
        );

        // 성공한 항목
        if (response.Deleted) {
          deleted.push(...response.Deleted.map((d) => d.Key!).filter(Boolean));
        }

        // 실패한 항목
        if (response.Errors) {
          failed.push(
            ...response.Errors.map((e) => ({
              key: e.Key!,
              error: e.Message || 'Unknown error',
            }))
          );
        }
      } catch (batchError) {
        // 배치 전체 실패
        deleteLogger.error('Batch delete failed', batchError);
        failed.push(
          ...batch.map((key) => ({
            key,
            error: batchError instanceof Error ? batchError.message : 'Batch delete failed',
          }))
        );
      }
    }
  } catch (error) {
    deleteLogger.error('S3 client error', error);
    failed.push(
      ...objectKeys.map((key) => ({
        key,
        error: error instanceof Error ? error.message : 'S3 client error',
      }))
    );
  }

  return { deleted, failed };
}

// ============ 병렬 배치 삭제 (대용량) ============

/**
 * 병렬 배치 삭제 (대용량 처리)
 * 1000개씩 청크로 나눈 후, 동시 실행 수를 제한하여 병렬 처리
 *
 * @param objectKeys 삭제할 object key 배열
 * @param concurrency 동시 실행 수 (기본: 3)
 * @returns 삭제 결과 (성공/실패 목록)
 */
export async function parallelBatchDeleteFromR2(
  objectKeys: string[],
  concurrency: number = DEFAULT_CONCURRENCY
): Promise<R2DeleteResult> {
  if (objectKeys.length === 0) {
    return { deleted: [], failed: [] };
  }

  // 청크로 분할
  const chunks: string[][] = [];
  for (let i = 0; i < objectKeys.length; i += MAX_BATCH_SIZE) {
    chunks.push(objectKeys.slice(i, i + MAX_BATCH_SIZE));
  }

  const allDeleted: string[] = [];
  const allFailed: Array<{ key: string; error: string }> = [];

  // 동시 실행 제한 병렬 처리
  for (let i = 0; i < chunks.length; i += concurrency) {
    const concurrentChunks = chunks.slice(i, i + concurrency);

    const results = await Promise.all(concurrentChunks.map((chunk) => batchDeleteFromR2(chunk)));

    for (const result of results) {
      allDeleted.push(...result.deleted);
      allFailed.push(...result.failed);
    }
  }

  deleteLogger.info('Parallel batch delete completed', {
    total: objectKeys.length,
    deleted: allDeleted.length,
    failed: allFailed.length,
  });

  return { deleted: allDeleted, failed: allFailed };
}
