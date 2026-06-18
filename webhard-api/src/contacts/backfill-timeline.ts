/**
 * 기존 문의 타임라인 백필 스크립트
 *
 * 기존 Contact의 타임스탬프 필드에서 ContactStatusHistory 엔트리를 생성합니다.
 *
 * 실행:
 *   cd webhard-api
 *   npx ts-node -r tsconfig-paths/register src/contacts/backfill-timeline.ts
 *
 * 또는 NestJS 모듈에서 호출:
 *   await backfillTimeline(prismaService);
 */

import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const logger = new Logger('BackfillTimeline');

interface BackfillEntry {
  contactId: string;
  changeType: string;
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  source: string;
  note: string;
  companyName: string | null;
  createdAt: Date;
}

export async function backfillTimeline(prisma: PrismaClient) {
  logger.log('Starting contact timeline backfill...');

  const contacts = await prisma.contact.findMany({
    select: {
      id: true,
      status: true,
      companyName: true,
      source: true,
      createdAt: true,
      confirmedAt: true,
      productionStartedAt: true,
      cuttingStartedAt: true,
      cuttingCompletedAt: true,
      finishingStartedAt: true,
      finishingCompletedAt: true,
    },
  });

  logger.log(`Found ${contacts.length} contacts to process`);

  let totalEntries = 0;

  for (const contact of contacts) {
    // Check if this contact already has timeline entries
    const existingCount = await prisma.contactStatusHistory.count({
      where: { contactId: contact.id },
    });

    if (existingCount > 0) {
      continue; // Skip already backfilled contacts
    }

    const entries: BackfillEntry[] = [];

    // 1. Created event
    const sourceLabel =
      contact.source === 'webhard' ? '웹하드' : contact.source === 'phone' ? '전화' : '웹사이트';

    entries.push({
      contactId: contact.id,
      changeType: 'created',
      fromStatus: null,
      toStatus: 'received',
      actorType: 'system',
      source: 'backfill',
      note: `기존 데이터 마이그레이션 (${sourceLabel})`,
      companyName: contact.companyName,
      createdAt: contact.createdAt,
    });

    // 2. Confirmed
    if (contact.confirmedAt) {
      entries.push({
        contactId: contact.id,
        changeType: 'status_change',
        fromStatus: 'drawing',
        toStatus: 'confirmed',
        actorType: 'system',
        source: 'backfill',
        note: '기존 타임스탬프에서 마이그레이션',
        companyName: contact.companyName,
        createdAt: contact.confirmedAt,
      });
    }

    // 3. Production started
    if (contact.productionStartedAt) {
      entries.push({
        contactId: contact.id,
        changeType: 'status_change',
        fromStatus: 'confirmed',
        toStatus: 'production',
        actorType: 'system',
        source: 'backfill',
        note: '기존 타임스탬프에서 마이그레이션',
        companyName: contact.companyName,
        createdAt: contact.productionStartedAt,
      });
    }

    // 4. Cutting started
    if (contact.cuttingStartedAt) {
      entries.push({
        contactId: contact.id,
        changeType: 'status_change',
        fromStatus: 'production',
        toStatus: 'cutting',
        actorType: 'system',
        source: 'backfill',
        note: '기존 타임스탬프에서 마이그레이션',
        companyName: contact.companyName,
        createdAt: contact.cuttingStartedAt,
      });
    }

    // 5. Finishing started
    if (contact.finishingStartedAt) {
      entries.push({
        contactId: contact.id,
        changeType: 'status_change',
        fromStatus: 'cutting',
        toStatus: 'finishing',
        actorType: 'system',
        source: 'backfill',
        note: '기존 타임스탬프에서 마이그레이션',
        companyName: contact.companyName,
        createdAt: contact.finishingStartedAt,
      });
    }

    if (entries.length > 0) {
      await prisma.contactStatusHistory.createMany({
        data: entries.map((e) => ({
          contactId: e.contactId,
          changeType: e.changeType,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          actorType: e.actorType,
          source: e.source,
          note: e.note,
          companyName: e.companyName,
          metadata: {},
          createdAt: e.createdAt,
        })),
      });
      totalEntries += entries.length;
    }
  }

  logger.log(`Complete: ${totalEntries} timeline entries created for ${contacts.length} contacts`);

  return { totalEntries, contactCount: contacts.length };
}

// CLI execution
if (require.main === module) {
  const prisma = new PrismaClient();

  backfillTimeline(prisma)
    .then((result) => {
      logger.log(`Result: ${JSON.stringify(result)}`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Error:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
