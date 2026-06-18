// R2 download utility (S3 compatible)
// Presigned URL 생성으로 직접 다운로드 지원

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getR2Client } from './client';

/**
 * R2 Presigned URL 생성 (다운로드용)
 * @param objectKey R2 object key (파일 경로)
 * @param expiresIn 만료 시간 (초, 기본 3600초 = 1시간)
 * @returns Presigned URL
 */
export async function getR2SignedUrl(objectKey: string, expiresIn: number = 3600): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME as string;

  if (!bucket) {
    throw new Error('R2 is not configured: missing bucket');
  }

  const s3 = getR2Client();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presignedUrl = await getSignedUrl(s3 as any, command as any, { expiresIn });

  return presignedUrl;
}

/**
 * 여러 파일에 대한 다운로드용 Presigned URL 일괄 생성
 * @param objectKeys R2 object key 배열
 * @param expiresIn 만료 시간 (초, 기본 3600초 = 1시간)
 * @returns Presigned URL 배열
 */
export async function getBatchR2SignedUrls(
  objectKeys: string[],
  expiresIn: number = 3600
): Promise<Array<{ objectKey: string; presignedUrl: string }>> {
  const results = await Promise.all(
    objectKeys.map(async (objectKey) => {
      const presignedUrl = await getR2SignedUrl(objectKey, expiresIn);
      return { objectKey, presignedUrl };
    })
  );

  return results;
}
