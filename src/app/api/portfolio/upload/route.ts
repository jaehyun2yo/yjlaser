import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, verifySession } from '@/lib/auth/session';
import { createAndUploadVariants } from '@/lib/images/process';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60초

export async function POST(request: NextRequest) {
  try {
    // 세션 검증
    const isAuthenticated = await verifySession();
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await getSessionUser();
    if (user?.userType !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 파일 크기 검증 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    // 이미지 업로드 및 변형 생성
    const result = await createAndUploadVariants(file);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to upload image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
