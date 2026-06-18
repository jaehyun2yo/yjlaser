import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { RevisionRequestHistory } from '@/types/database.types';
import {
  serverGetContact,
  serverUpdateContact,
  serverCreateDrawingRevision,
} from '@/lib/api/nestjs-server-client';
import { logger } from '@/lib/utils/logger';
import { requireCompanyRecordAccess, requireSessionUser } from '@/app/api/_lib/route-authorization';

const log = logger.createLogger('REVISION_REQUEST_API');
const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

interface RevisionRequestDriveUploadResponse {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

async function uploadRevisionRequestFileToDrive(
  contactId: string,
  file: File
): Promise<RevisionRequestDriveUploadResponse | null> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(
    `${NESTJS_API_URL}/api/v1/contacts/${encodeURIComponent(
      contactId
    )}/revision-request-file/drive`,
    {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.MIGRATION_API_KEY || '',
      },
      body: formData,
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: '파일 업로드 실패' }));
    log.warn('수정요청 Drive 파일 업로드 실패', {
      contactId,
      status: response.status,
      error: errorData,
    });
    return null;
  }

  return (await response.json()) as RevisionRequestDriveUploadResponse;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSessionUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // 기존 수정요청 정보 가져오기 (NestJS API)
    const currentContact = await serverGetContact(id);
    if (!currentContact) {
      return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    const accessError = await requireCompanyRecordAccess(auth.user, currentContact);
    if (accessError) return accessError;

    const formData = await request.formData();
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const file = formData.get('file') as File | null;

    if (!title || !content) {
      return NextResponse.json({ error: '제목과 내용을 모두 입력해주세요.' }, { status: 400 });
    }

    // 파일 업로드 처리
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file && file.size > 0) {
      try {
        if (file.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: '파일 크기는 10MB 이하여야 합니다.' }, { status: 400 });
        }

        const result = await uploadRevisionRequestFileToDrive(id, file);
        if (result?.url) {
          fileUrl = result.url;
          fileName = result.name || file.name;
        }
      } catch {
        // 파일 업로드 실패해도 수정요청은 저장
      }
    }

    // 기존 수정요청이 있으면 히스토리에 추가
    let history: RevisionRequestHistory = [];
    if (currentContact?.revision_request_history) {
      try {
        history = Array.isArray(currentContact.revision_request_history)
          ? currentContact.revision_request_history
          : JSON.parse(currentContact.revision_request_history as string);
      } catch {
        history = [];
      }
    }

    if (currentContact?.revision_request_title && currentContact?.revision_requested_at) {
      history.push({
        title: currentContact.revision_request_title as string,
        content: (currentContact.revision_request_content as string) || '',
        requested_at: currentContact.revision_requested_at as string,
        file_url: (currentContact.revision_request_file_url as string) || null,
        file_name: (currentContact.revision_request_file_name as string) || null,
      });
    }

    // NestJS API로 업데이트
    const updateData: Record<string, unknown> = {
      revisionRequestTitle: (title as string).trim(),
      revisionRequestContent: (content as string).trim(),
      status: 'revision_in_progress',
    };

    if (fileUrl) {
      updateData.revisionRequestFileUrl = fileUrl;
      updateData.revisionRequestFileName = fileName;
    }

    const result = await serverUpdateContact(id, updateData);

    if (!result.success) {
      // 필드가 없는 경우를 대비해 status만 업데이트 시도
      const statusResult = await serverUpdateContact(id, { status: 'revision_in_progress' });

      if (!statusResult.success) {
        return NextResponse.json({ error: '수정요청 제출에 실패했습니다.' }, { status: 500 });
      }
    }

    // 파일이 첨부된 경우 DrawingRevision도 생성 (추가 동작 — 실패해도 수정요청은 완료)
    if (fileUrl && fileName) {
      try {
        await serverCreateDrawingRevision(id, {
          reason: 'revision_request',
          files: [
            {
              url: fileUrl,
              name: fileName,
              size: file?.size ?? 0,
              mimeType: file?.type || 'application/octet-stream',
            },
          ],
          note: `${title} — ${content}`.slice(0, 500),
          source: 'manual',
          isPublic: true,
        });
      } catch (err) {
        log.error('DrawingRevision 생성 실패 (수정요청은 완료됨)', err);
      }
    }

    revalidatePath('/company/dashboard');
    revalidatePath(`/admin/contacts/${id}`);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
