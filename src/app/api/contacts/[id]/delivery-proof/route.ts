import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import {
  serverGetFileDownloadUrl,
  serverGetContact,
  serverGetCompany,
} from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('DELIVERY_PROOF_API');

/**
 * GET /api/contacts/[id]/delivery-proof
 * 납품 증빙 사진 presigned URL 반환
 *
 * 접근 제어:
 * - Admin: 모든 사진 접근 가능
 * - Company: 자사 문의 건만 접근 가능
 * - Worker: 모든 납품 사진 접근 가능
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // 1. Admin/Company 세션 확인
    const user = await getSessionUser();

    if (user?.userType === 'admin') {
      return await getPresignedUrl(id);
    }

    if (user?.userType === 'company') {
      // Company 소속 검증: contact의 company_name과 세션 company 일치 확인
      const [contact, company] = await Promise.all([
        serverGetContact(id),
        serverGetCompany(Number(user.userId)),
      ]);

      if (!contact || !company) {
        return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 });
      }

      const contactCompany = (contact as Record<string, unknown>).company_name;
      const sessionCompany = company.company_name;

      if (contactCompany !== sessionCompany) {
        return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
      }

      return await getPresignedUrl(id);
    }

    // 2. Worker 세션 확인
    const workerSession = await getErpWorkerSession();
    if (workerSession) {
      return await getPresignedUrl(id);
    }

    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  } catch (error) {
    log.error('납품 증빙 사진 URL 생성 실패', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '서버 오류' },
      { status: 500 }
    );
  }
}

async function getPresignedUrl(contactId: string) {
  const result = await serverGetFileDownloadUrl(contactId, 'delivery_proof');

  if (!result) {
    return NextResponse.json({ error: '납품 증빙 사진이 없습니다.' }, { status: 404 });
  }

  return NextResponse.json({
    url:
      result.provider === 'GOOGLE_DRIVE' && result.fileId
        ? `/api/contacts/${encodeURIComponent(contactId)}/file-stream?type=delivery_proof`
        : result.url,
    fileName: result.fileName,
  });
}
