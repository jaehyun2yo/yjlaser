/**
 * 웹하드 공유 링크 API
 * POST: 공유 링크 생성
 * GET: 회사별 공유 링크 목록 조회
 * DELETE: 공유 링크 비활성화
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/auth/adminGuard';
import { logger } from '@/lib/utils/logger';
import type { CreateShareLinkDTO, ShareLinkDTO } from '@/app/webhard/_lib/types';
import { nestjsFetch } from '@/lib/api/nestjs-server-client';

const log = logger.createLogger('WebhardShareLinkAPI');

function createShareToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getCreatedByValue(userId: string | number): number {
  if (typeof userId === 'number') {
    return userId;
  }

  const parsed = Number.parseInt(userId, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

type SearchFileRecord = {
  id: string;
  company_id: number | null;
  path: string;
};

/**
 * POST /api/webhard/share - 공유 링크 생성
 */
export async function POST(request: NextRequest) {
  try {
    // 세션 기반 인증
    const authResult = await requireAuth();
    if (!authResult.authorized) {
      return authResult.response!;
    }
    const { userType, userId } = authResult.user!;

    const body: CreateShareLinkDTO = await request.json();
    const { file_path, file_name, company_id, expires_in_hours, max_downloads } = body;

    if (!file_path || !file_name || expires_in_hours <= 0) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    // company 사용자: file_path 소유권 검증 (NestJS files/search API 사용)
    const effectiveCompanyId =
      userType === 'company'
        ? typeof userId === 'string'
          ? parseInt(userId, 10)
          : userId
        : company_id;

    let webhardFileId: string | undefined;
    if (userType === 'company') {
      const companyIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
      const searchResponse = await nestjsFetch<SearchFileRecord[]>(
        `/files/search?query=${encodeURIComponent(file_name)}&companyId=${companyIdNum}&limit=50`
      );

      // path 기반으로 정확한 파일 매칭 확인
      const fileRecord = searchResponse.ok
        ? searchResponse.data.find((f) => f.path === file_path)
        : null;

      if (!fileRecord) {
        log.warn('공유 링크 생성 거부 - 파일 없음', { file_path, userId });
        return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 });
      }

      // 파일의 company_id가 null(공용)이거나 본인 회사 소유인 경우만 허용
      if (fileRecord.company_id !== null && fileRecord.company_id !== companyIdNum) {
        log.warn('공유 링크 생성 거부 - 소유권 없음', {
          file_path,
          fileCompanyId: fileRecord.company_id,
          requestCompanyId: companyIdNum,
        });
        return NextResponse.json(
          { error: '해당 파일에 대한 접근 권한이 없습니다.' },
          { status: 403 }
        );
      }
      webhardFileId = fileRecord.id;
    }

    // NestJS API를 통해 공유 링크 생성
    const response = await nestjsFetch<ShareLinkDTO>('/share-links', {
      method: 'POST',
      body: {
        token: createShareToken(),
        filePath: file_path,
        webhardFileId,
        fileName: file_name,
        companyId: effectiveCompanyId,
        createdBy: getCreatedByValue(userId),
        expiresAt: new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString(),
        maxDownloads: max_downloads,
      },
    });

    if (!response.ok) {
      log.error('공유 링크 생성 실패', { status: response.status });
      return NextResponse.json({ error: '공유 링크 생성에 실패했습니다.' }, { status: 500 });
    }

    log.info('공유 링크 생성 성공', { file_name, expires_in_hours });

    return NextResponse.json(response.data, { status: 201 });
  } catch (error) {
    log.error('POST /api/webhard/share 에러', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * GET /api/webhard/share - 회사별 공유 링크 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    // 세션 기반 인증
    const authResult = await requireAuth();
    if (!authResult.authorized) {
      return authResult.response!;
    }
    const { userType, userId } = authResult.user!;

    const { searchParams } = new URL(request.url);
    const companyIdParam = searchParams.get('companyId');

    // NestJS API를 통해 공유 링크 목록 조회
    const queryParams = new URLSearchParams();
    if (userType === 'company') {
      const companyIdNum = typeof userId === 'string' ? parseInt(userId, 10) : userId;
      queryParams.set('companyId', String(companyIdNum));
    } else if (companyIdParam) {
      queryParams.set('companyId', companyIdParam);
    }

    const queryStr = queryParams.toString();
    const response = await nestjsFetch<ShareLinkDTO[]>(
      `/share-links${queryStr ? `?${queryStr}` : ''}`
    );

    if (!response.ok) {
      log.error('공유 링크 목록 조회 실패', { status: response.status });
      return NextResponse.json({ error: '공유 링크 목록 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json(response.data, { status: 200 });
  } catch (error) {
    log.error('GET /api/webhard/share 에러', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/webhard/share - 공유 링크 비활성화
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (!authResult.authorized) {
      return authResult.response!;
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    // NestJS API를 통해 공유 링크 비활성화
    const response = await nestjsFetch<ShareLinkDTO>(`/share-links/deactivate`, {
      method: 'POST',
      body: { token },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: '공유 링크를 찾을 수 없습니다.' }, { status: 404 });
      }
      log.error('공유 링크 비활성화 실패', { status: response.status });
      return NextResponse.json({ error: '공유 링크 비활성화에 실패했습니다.' }, { status: 500 });
    }

    log.info('공유 링크 비활성화 성공', { token });

    return NextResponse.json(response.data, { status: 200 });
  } catch (error) {
    log.error('DELETE /api/webhard/share 에러', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
