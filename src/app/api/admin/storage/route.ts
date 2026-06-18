import { NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const apiLogger = logger.createLogger('ADMIN_STORAGE_API');

// 최대 용량 (100GB, 바이트 단위)
const MAX_STORAGE_BYTES = 100 * 1024 * 1024 * 1024;

/**
 * GET /api/admin/storage
 * 전체 웹하드 사용량 조회 (관리자 전용)
 * NestJS API 경유 (Prisma ORM)
 */
export async function GET() {
  try {
    // 인증 확인
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getSessionUser();
    if (!user || user.userType !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // NestJS Storage API 사용
    const response = await nestjsFetch<{
      totalSize: number;
      fileCount: number;
    }>('/storage');

    if (!response.ok) {
      apiLogger.error('NestJS storage API error', { status: response.status });
      return NextResponse.json({ error: 'Failed to calculate storage' }, { status: 500 });
    }

    const totalUsed = response.data.totalSize || 0;

    return NextResponse.json({
      used: totalUsed,
      max: MAX_STORAGE_BYTES,
      usedFormatted: formatBytes(totalUsed),
      maxFormatted: formatBytes(MAX_STORAGE_BYTES),
      percentage: Math.round((totalUsed / MAX_STORAGE_BYTES) * 100),
    });
  } catch (error) {
    apiLogger.error('Exception in GET', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
