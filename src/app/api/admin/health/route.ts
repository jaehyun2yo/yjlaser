import { requireAdmin } from '@/lib/auth/adminGuard';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

const healthLogger = logger.createLogger('ADMIN_HEALTH');

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export async function GET() {
  // Admin authentication check
  const authResult = await requireAdmin();
  if (!authResult.authorized) {
    return authResult.response!;
  }

  try {
    const start = Date.now();
    const response = await fetch(`${NESTJS_API_URL}/api/v1/health/detailed`, {
      headers: { 'X-API-Key': process.env.MIGRATION_API_KEY || '' },
      signal: AbortSignal.timeout(5000),
    });
    const responseTime = Date.now() - start;

    if (!response.ok) {
      healthLogger.warn('NestJS health endpoint returned non-OK status', {
        status: response.status,
        responseTime,
      });
      return NextResponse.json({
        api: { status: 'error' as const, responseTime },
        database: { ok: false, queryTimeMs: null },
      });
    }

    const healthData: Record<string, unknown> = await response.json();
    return NextResponse.json({
      ...healthData,
      api: { status: 'ok' as const, responseTime },
    });
  } catch (error) {
    healthLogger.error(
      'Failed to connect to NestJS health endpoint',
      error instanceof Error ? error : undefined
    );
    return NextResponse.json(
      {
        api: {
          status: 'down' as const,
          error: error instanceof Error ? error.message : 'Connection failed',
        },
        database: { ok: false, queryTimeMs: null },
      },
      { status: 200 }
    );
  }
}
