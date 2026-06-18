import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';
import { serverGetCompany } from '@/lib/api/nestjs-server-client';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

export type RouteAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

export async function requireSessionUser(): Promise<RouteAuthResult> {
  const user = await getSessionUser();
  if (!user?.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  return { ok: true, user };
}

export async function requireAdminSession(): Promise<RouteAuthResult> {
  const auth = await requireSessionUser();
  if (!auth.ok) return auth;

  if (auth.user.userType !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }),
    };
  }

  return auth;
}

export async function requireWorkerSelf(
  workerId: string
): Promise<
  | { ok: true; worker: NonNullable<Awaited<ReturnType<typeof getErpWorkerSession>>> }
  | { ok: false; response: NextResponse }
> {
  const worker = await getErpWorkerSession();
  if (!worker) {
    return {
      ok: false,
      response: NextResponse.json({ error: '작업자 인증이 필요합니다.' }, { status: 401 }),
    };
  }

  if (worker.workerId !== workerId) {
    return {
      ok: false,
      response: NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }),
    };
  }

  return { ok: true, worker };
}

export async function getSessionCompanyName(user: SessionUser): Promise<string | null> {
  if (user.userType !== 'company') return null;

  const companyId = Number(user.userId);
  if (!Number.isFinite(companyId)) return null;

  const company = await serverGetCompany(companyId);
  const companyRecord = company as Record<string, unknown> | null;
  const companyName =
    typeof company?.company_name === 'string'
      ? company.company_name
      : typeof companyRecord?.companyName === 'string'
        ? companyRecord.companyName
        : null;

  return companyName?.trim() || null;
}

export function getRecordCompanyName(
  record: Record<string, unknown> | null | undefined
): string | null {
  if (!record) return null;

  const value = record.company_name ?? record.companyName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function canAccessCompanyRecord(
  user: SessionUser,
  record: Record<string, unknown> | null | undefined
): Promise<boolean> {
  if (user.userType === 'admin') return true;

  const sessionCompanyName = await getSessionCompanyName(user);
  const recordCompanyName = getRecordCompanyName(record);

  return Boolean(
    sessionCompanyName && recordCompanyName && sessionCompanyName === recordCompanyName
  );
}

export async function requireCompanyRecordAccess(
  user: SessionUser,
  record: Record<string, unknown> | null | undefined
): Promise<NextResponse | null> {
  if (await canAccessCompanyRecord(user, record)) return null;

  return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
}

export async function getCompanyScopedNameForRequest(
  user: SessionUser,
  requestedCompanyName: string | null
): Promise<{ ok: true; companyName: string } | { ok: false; response: NextResponse }> {
  if (user.userType === 'admin') {
    if (!requestedCompanyName?.trim()) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'companyName is required' }, { status: 400 }),
      };
    }

    return { ok: true, companyName: requestedCompanyName.trim() };
  }

  const sessionCompanyName = await getSessionCompanyName(user);
  if (!sessionCompanyName) {
    return {
      ok: false,
      response: NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 }),
    };
  }

  return { ok: true, companyName: sessionCompanyName };
}
