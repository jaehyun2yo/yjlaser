import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CompanyFolderLookupResult {
  id: number;
  companyName: string;
}

/**
 * 폴더명으로 가입 업체를 lookup (read-only).
 *
 * task 26: `getUploadPresignedUrl` routing 에서 사용. AutoContactService.matchCompanyInfo 의
 * tier 0~2 와 동일 (정규화 매칭 + pending alias upsert 인 tier 3 은 본 util 의 범위가 아니다).
 *
 * - tier 0: `CompanyFolderAlias.status='approved'` 매칭 (admin 승인된 매핑)
 * - tier 1: `Company.companyName` insensitive equals + `isApproved=true`
 * - tier 2: `Company.companyName` insensitive equals (isApproved 무관 fallback)
 *
 * 모두 실패 시 null. side effect 없음.
 */
export async function lookupCompanyByFolderName(
  client: Prisma.TransactionClient | PrismaService,
  folderName: string
): Promise<CompanyFolderLookupResult | null> {
  const trimmed = folderName.trim();
  if (!trimmed) return null;

  const select = { id: true, companyName: true } as const;

  // tier 0: approved alias
  const approvedAlias = await client.companyFolderAlias.findFirst({
    where: { folderName: trimmed, status: 'approved' },
    include: { company: { select } },
  });
  if (approvedAlias?.company) return approvedAlias.company;

  // tier 1: company.isApproved=true 일치
  const approved = await client.company.findFirst({
    where: {
      companyName: { equals: trimmed, mode: 'insensitive' },
      isApproved: true,
    },
    select,
  });
  if (approved) return approved;

  // tier 2: company name 일치 (isApproved 무관 fallback)
  const exactAny = await client.company.findFirst({
    where: { companyName: { equals: trimmed, mode: 'insensitive' } },
    select,
  });
  if (exactAny) return exactAny;

  return null;
}
