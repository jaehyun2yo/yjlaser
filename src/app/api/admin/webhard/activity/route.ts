import { NextRequest, NextResponse } from 'next/server';
import { verifySession, getSessionUser } from '@/lib/auth/session';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const apiLogger = logger.createLogger('ADMIN_WEBHARD_ACTIVITY_API');

export interface WebhardActivity {
  id: string;
  action: 'upload' | 'download' | 'delete' | 'move';
  file_id: string;
  file_name: string;
  user_id: number;
  user_name: string;
  company_id?: number;
  company_name?: string;
  timestamp: string;
}

/**
 * GET /api/admin/webhard/activity
 * 웹하드 활동 로그 조회 (관리자 전용)
 * NestJS API 경유 (Prisma ORM)
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // NestJS Files API에서 최근 파일 조회
    const response = await nestjsFetch<{
      files: {
        id: string;
        original_name: string;
        uploaded_by: string;
        company_id: number | null;
        created_at: string;
        companies?: {
          company_name: string;
        } | null;
      }[];
      total: number;
    }>(`/files?limit=${limit}&sortBy=created_at&sortOrder=desc`);

    if (!response.ok) {
      apiLogger.error('NestJS files API error', { status: response.status });
      return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }

    // 최근 파일을 활동 형식으로 변환
    const activities: WebhardActivity[] = response.data.files.map((file) => ({
      id: file.id,
      action: 'upload' as const,
      file_id: file.id,
      file_name: file.original_name,
      user_id: Number(file.uploaded_by),
      user_name: 'User',
      company_id: file.company_id ? Number(file.company_id) : undefined,
      company_name: file.companies?.company_name || 'Unknown Company',
      timestamp: file.created_at,
    }));

    return NextResponse.json({ activities });
  } catch (error) {
    apiLogger.error('Exception in GET', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
