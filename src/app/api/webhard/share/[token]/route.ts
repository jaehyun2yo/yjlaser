/**
 * 웹하드 공유 링크 접근 API
 * GET /api/webhard/share/[token] - 토큰으로 파일 다운로드 (인증 불필요)
 * NestJS API 경유로 전환됨
 */

import { NextRequest, NextResponse } from 'next/server';
import { toByteStringHeaderValue } from '@/lib/api/headerEncoding';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('WebhardShareTokenAPI');
const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_KEY = process.env.MIGRATION_API_KEY || '';

interface RouteContext {
  params: Promise<{
    token: string;
  }>;
}

/**
 * GET /api/webhard/share/[token] - 토큰으로 파일 다운로드
 * 인증 불필요, 만료 확인 및 다운로드 횟수 체크
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    const streamResponse = await fetch(`${NESTJS_API_URL}/api/v1/share-links/download/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      },
      body: JSON.stringify({ token }),
    });

    if (!streamResponse.ok) {
      const errorMessage =
        streamResponse.status === 403
          ? '유효하지 않은 공유 링크입니다.'
          : '파일 다운로드 링크 생성에 실패했습니다.';
      log.warn('공유 링크 다운로드 실패', { status: streamResponse.status });
      return NextResponse.json(
        { error: errorMessage },
        { status: streamResponse.status === 403 ? 403 : 500 }
      );
    }

    const headers = new Headers();
    const contentType = streamResponse.headers.get('content-type');
    const contentLength = streamResponse.headers.get('content-length');
    const contentDisposition = toByteStringHeaderValue(
      streamResponse.headers.get('content-disposition')
    );
    if (contentType) headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (contentDisposition) headers.set('Content-Disposition', contentDisposition);

    log.info('공유 링크 다운로드 성공');
    return new NextResponse(streamResponse.body, { status: 200, headers });
  } catch (error) {
    log.error('GET /api/webhard/share/[token] 에러', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
