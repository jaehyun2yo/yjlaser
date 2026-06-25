import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeCompanyName } from './company-name-match.util';

/**
 * `resolveCompanyRoot` 실패 사유 코드.
 *
 * - `NO_COMPANY_ROOT`: 정식 Company row 매칭은 성공했으나 그 `companyId` 의 루트 폴더가 없음.
 * - `AMBIGUOUS_COMPANY_MATCH`: 활성/승인 Company row 가 2건 이상 매칭되어 자동 선택 불가.
 * - `NO_FALLBACK_MATCH`: Company 매칭 실패 + 완전 일치/정규화 매칭 fallback 모두 실패.
 *   `companyName` 누락 시에도 동일 코드를 반환한다.
 */
export type CompanyRootReasonCode =
  | 'NO_COMPANY_ROOT'
  | 'NO_FALLBACK_MATCH'
  | 'AMBIGUOUS_COMPANY_MATCH';

export interface ResolveCompanyRootResult {
  rootFolderId: string | null;
  /** 정식 `Company` row 매칭에 성공했을 때만 채움. fallback 성공 시 null. */
  companyId: number | null;
  reasonCode?: CompanyRootReasonCode;
}

/**
 * 업체명으로 웹하드 루트 폴더를 단일 진입점에서 탐색한다 (task 22).
 *
 * 탐색 3단계 (`docs/specs/features/drawing-workflow.md` §W.1 준수):
 *   1. `Company` 테이블에서 `companyName` 일치 → 그 `companyId` 의 루트 `webhard_folders` 조회.
 *   2. 1 실패 시 `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc) — `folderKind in ('generic','root')`.
 *   3. 2 실패 시 정규화 매칭 fallback (task 21) — NFKC + 공백/특수문자 제거 + 소문자화.
 *
 * 모두 실패하면 `{ rootFolderId: null, companyId: null, reasonCode: 'NO_FALLBACK_MATCH' }`.
 *
 * `client` 인자는 `$transaction` 콜백에서 받은 `Prisma.TransactionClient` 또는 외부 호출용 `PrismaService`
 * 모두 받을 수 있도록 유니온으로 정의.
 *
 * 순수 조회 함수 — 폴더 생성·이동 등 mutation 은 호출자가 결과를 받아 별도로 수행한다.
 */
export async function resolveCompanyRoot(
  client: Prisma.TransactionClient | PrismaService,
  companyName: string | null | undefined
): Promise<ResolveCompanyRootResult> {
  if (!companyName) {
    return { rootFolderId: null, companyId: null, reasonCode: 'NO_FALLBACK_MATCH' };
  }

  // 1단계: 정식 Company row 매칭. 중복 후보는 자동 선택하지 않는다.
  const companyMatches = await client.company.findMany({
    where: {
      companyName,
      deletedAt: null,
      status: 'active',
      isApproved: true,
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: 2,
  });

  if (companyMatches.length > 1) {
    return { rootFolderId: null, companyId: null, reasonCode: 'AMBIGUOUS_COMPANY_MATCH' };
  }

  const company = companyMatches[0] ?? null;

  if (company) {
    const rootFolder = await client.webhardFolder.findFirst({
      where: { companyId: company.id, parentId: null, deletedAt: null },
      select: { id: true },
    });
    if (rootFolder) {
      return { rootFolderId: rootFolder.id, companyId: company.id };
    }
    return { rootFolderId: null, companyId: company.id, reasonCode: 'NO_COMPANY_ROOT' };
  }

  // 2단계: name 완전 일치 fallback (Company 미등록 가상 업체).
  // 우선순위: companyId 있는 것 > 가장 오래된 것. folderKind 는 generic / root 만.
  const nameMatch = await client.webhardFolder.findFirst({
    where: {
      name: companyName,
      deletedAt: null,
      folderKind: { in: ['generic', 'root'] },
    },
    orderBy: [{ companyId: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  if (nameMatch) {
    return { rootFolderId: nameMatch.id, companyId: null };
  }

  // 3단계: 정규화 매칭 fallback. 'ABC 회사' ↔ 'ABC회사' 같은 기호·공백 차이 흡수.
  const normalized = normalizeCompanyName(companyName);
  if (normalized) {
    const candidates = await client.webhardFolder.findMany({
      where: {
        deletedAt: null,
        folderKind: { in: ['generic', 'root'] },
      },
      orderBy: [{ companyId: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true },
    });
    const match = candidates.find((f) => normalizeCompanyName(f.name) === normalized);
    if (match) {
      return { rootFolderId: match.id, companyId: null };
    }
  }

  return { rootFolderId: null, companyId: null, reasonCode: 'NO_FALLBACK_MATCH' };
}
