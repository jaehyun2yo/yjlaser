/**
 * resolveCompanyRoot 단위 테스트 (task 22 phase 2).
 *
 * 스펙: docs/specs/features/drawing-workflow.md §W.1
 *       tasks/22-contact-webhard-navigate/phase1.md §1
 *
 * 탐색 3단계:
 *   1. Company 테이블 매칭 → companyId 기반 루트 폴더 조회
 *   2. webhardFolder.name 완전 일치 fallback (task 20, 9be443cc)
 *   3. 정규화 매칭 fallback (task 21) — NFKC + 공백/특수문자 제거 + 소문자화
 *
 * 호출 순서/횟수 검증은 3단계가 정책대로 순차 시도되는지 확인하는 핵심 분기.
 */

import { resolveCompanyRoot } from './resolve-company-root.util';

interface PrismaLike {
  company: { findMany: jest.Mock };
  webhardFolder: { findFirst: jest.Mock; findMany: jest.Mock };
}

function makeClient(): PrismaLike {
  return {
    company: { findMany: jest.fn().mockResolvedValue([]) },
    webhardFolder: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('resolveCompanyRoot', () => {
  it('#1: Company 테이블에 등록된 업체 → companyId + rootFolderId 반환 (1단계 성공, fallback 호출 없음)', async () => {
    const client = makeClient();
    client.company.findMany.mockResolvedValueOnce([{ id: 42 }]);
    client.webhardFolder.findFirst.mockResolvedValueOnce({ id: 'root-42' });

    const result = await resolveCompanyRoot(client as never, '거래처A');

    expect(result).toEqual({ rootFolderId: 'root-42', companyId: 42 });
    expect(result.reasonCode).toBeUndefined();
    // 1단계 성공: company.findFirst 1회, webhardFolder.findFirst 1회 (companyId 기반 루트 조회).
    expect(client.company.findMany).toHaveBeenCalledTimes(1);
    expect(client.company.findMany).toHaveBeenCalledWith({
      where: {
        companyName: '거래처A',
        deletedAt: null,
        status: 'active',
        isApproved: true,
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 2,
    });
    expect(client.webhardFolder.findFirst).toHaveBeenCalledTimes(1);
    const folderCall = client.webhardFolder.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(folderCall.where).toMatchObject({ companyId: 42, parentId: null });
    // 2·3단계는 호출되지 않음.
    expect(client.webhardFolder.findMany).not.toHaveBeenCalled();
  });

  it('#2: Company 미등록 + webhardFolder.name 완전 일치 → companyId null + rootFolderId 반환 (2단계 성공)', async () => {
    const client = makeClient();
    client.company.findMany.mockResolvedValueOnce([]);
    client.webhardFolder.findFirst.mockResolvedValueOnce({ id: 'virtual-root-name-match' });

    const result = await resolveCompanyRoot(client as never, '가상업체B');

    expect(result).toEqual({ rootFolderId: 'virtual-root-name-match', companyId: null });
    expect(result.reasonCode).toBeUndefined();
    // 1단계 실패 후 2단계만 호출 — findFirst 1회 (name 완전 일치).
    expect(client.company.findMany).toHaveBeenCalledTimes(1);
    expect(client.webhardFolder.findFirst).toHaveBeenCalledTimes(1);
    const nameMatchCall = client.webhardFolder.findFirst.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(nameMatchCall.where).toMatchObject({ name: '가상업체B' });
    // 3단계 (정규화 fallback) 는 호출되지 않음.
    expect(client.webhardFolder.findMany).not.toHaveBeenCalled();
  });

  it('#3: Company 미등록 + name 완전 일치 실패 + 정규화 매칭 성공 (공백 차이) → rootFolderId 반환 (3단계 성공)', async () => {
    const client = makeClient();
    client.company.findMany.mockResolvedValueOnce([]);
    // 2단계: name 완전 일치 실패.
    client.webhardFolder.findFirst.mockResolvedValueOnce(null);
    // 3단계: 후보 목록 조회 — 공백이 제거된 'ABC회사' 가 입력 'ABC 회사' 와 정규화 후 동일.
    client.webhardFolder.findMany.mockResolvedValueOnce([
      { id: 'other-root', name: '다른업체' },
      { id: 'virtual-root-normalized', name: 'ABC회사' },
    ]);

    const result = await resolveCompanyRoot(client as never, 'ABC 회사');

    expect(result).toEqual({ rootFolderId: 'virtual-root-normalized', companyId: null });
    expect(result.reasonCode).toBeUndefined();
    // 3단계까지 순차 시도 — findFirst 2회(1단계 companyId 루트 + 2단계 name 매칭 중 1단계는 company null 이므로 skip, 실제로는 2단계만 호출).
    // 1단계는 Company 없으면 webhardFolder.findFirst 조회 자체를 하지 않음.
    expect(client.company.findMany).toHaveBeenCalledTimes(1);
    expect(client.webhardFolder.findFirst).toHaveBeenCalledTimes(1); // 2단계 name 완전 일치
    expect(client.webhardFolder.findMany).toHaveBeenCalledTimes(1); // 3단계 정규화
  });

  it('#4: 모두 실패 → rootFolderId null + reasonCode NO_FALLBACK_MATCH', async () => {
    const client = makeClient();
    client.company.findMany.mockResolvedValueOnce([]);
    client.webhardFolder.findFirst.mockResolvedValueOnce(null);
    client.webhardFolder.findMany.mockResolvedValueOnce([
      { id: 'unrelated-root', name: '전혀다른업체' },
    ]);

    const result = await resolveCompanyRoot(client as never, '없는업체');

    expect(result).toEqual({
      rootFolderId: null,
      companyId: null,
      reasonCode: 'NO_FALLBACK_MATCH',
    });
    // 3단계 모두 시도한 뒤 실패.
    expect(client.company.findMany).toHaveBeenCalledTimes(1);
    expect(client.webhardFolder.findFirst).toHaveBeenCalledTimes(1);
    expect(client.webhardFolder.findMany).toHaveBeenCalledTimes(1);
  });

  it('#5: Company 후보 2건 이상이면 fallback 없이 AMBIGUOUS_COMPANY_MATCH 를 반환한다', async () => {
    const client = makeClient();
    client.company.findMany.mockResolvedValueOnce([{ id: 41 }, { id: 42 }]);

    const result = await resolveCompanyRoot(client as never, '거래처A');

    expect(result).toEqual({
      rootFolderId: null,
      companyId: null,
      reasonCode: 'AMBIGUOUS_COMPANY_MATCH',
    });
    expect(client.webhardFolder.findFirst).not.toHaveBeenCalled();
    expect(client.webhardFolder.findMany).not.toHaveBeenCalled();
  });
});
