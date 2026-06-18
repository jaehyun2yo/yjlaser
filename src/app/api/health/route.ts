import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Server health check endpoint — includes NestJS backend connectivity
 */
export async function GET() {
  const nestjsUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  let nestjsStatus = 'unknown';
  try {
    const res = await fetch(`${nestjsUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    nestjsStatus = res.ok ? 'healthy' : 'degraded';
  } catch {
    nestjsStatus = 'unhealthy';
  }

  return NextResponse.json({
    status: 'ok',
    nestjs: nestjsStatus,
    timestamp: new Date().toISOString(),
  });
}
