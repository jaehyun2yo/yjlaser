/**
 * API 키 관리 스크립트
 *
 * 사용법:
 *   cd webhard-api
 *   npx tsx scripts/manage-api-keys.ts list          # 모든 키 조회
 *   npx tsx scripts/manage-api-keys.ts check         # 동기화 앱 키 상태 확인
 *   npx tsx scripts/manage-api-keys.ts activate      # 비활성 키 재활성화
 *   npx tsx scripts/manage-api-keys.ts create-sync   # 새 동기화 전용 키 생성
 */
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// 동기화 앱 기본 키 (config-manager.ts DEFAULT_CONFIG와 동일)
const SYNC_APP_DEFAULT_KEY = 'yjl_4512a2a242752e014280df2dc402b84f7286a4e94192c7b81632d3bfa6c38f90';

async function listKeys() {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
  });

  console.log('\n=== API Keys ===\n');
  for (const k of keys) {
    console.log(`  ID:          ${k.id}`);
    console.log(`  Name:        ${k.name}`);
    console.log(`  ProgramType: ${k.programType}`);
    console.log(`  Permissions: ${k.permissions.join(', ')}`);
    console.log(`  Active:      ${k.isActive ? '✅ YES' : '❌ NO'}`);
    console.log(`  Last Used:   ${k.lastUsedAt?.toISOString() ?? 'never'}`);
    console.log(`  Created:     ${k.createdAt.toISOString()}`);
    console.log('  ---');
  }
  console.log(`\n  Total: ${keys.length} keys\n`);
}

async function checkSyncKey() {
  const keyHash = hashKey(SYNC_APP_DEFAULT_KEY);

  // 해시로 직접 검색
  const byHash = await prisma.apiKey.findFirst({ where: { keyHash } });

  // ID로도 검색 (seed 기준)
  const byId = await prisma.apiKey.findUnique({ where: { id: 'integration-api' } });

  console.log('\n=== 동기화 앱 키 상태 확인 ===\n');

  if (byHash) {
    console.log(`  ✅ 키 해시 일치하는 레코드 발견`);
    console.log(`  ID:       ${byHash.id}`);
    console.log(`  Name:     ${byHash.name}`);
    console.log(`  Active:   ${byHash.isActive ? '✅ YES' : '❌ NO ← 이것이 401 원인!'}`);
    console.log(`  LastUsed: ${byHash.lastUsedAt?.toISOString() ?? 'never'}`);

    if (!byHash.isActive) {
      console.log('\n  💡 해결: npx tsx scripts/manage-api-keys.ts activate');
    }
  } else {
    console.log(`  ❌ 키 해시 일치하는 레코드 없음 (DB에 키가 없거나 다른 키로 seed됨)`);
    console.log(`  💡 해결: npx tsx scripts/manage-api-keys.ts create-sync`);
  }

  if (byId) {
    console.log(`\n  [참고] integration-api ID 레코드:`);
    console.log(`  Hash 일치: ${byId.keyHash === keyHash ? 'YES' : 'NO (다른 키로 seed됨)'}`);
    console.log(`  Active:    ${byId.isActive}`);
  }
  console.log();
}

async function activateKeys() {
  const keyHash = hashKey(SYNC_APP_DEFAULT_KEY);

  // 1. 해시 매칭 키 활성화
  const byHash = await prisma.apiKey.findFirst({ where: { keyHash } });
  if (byHash && !byHash.isActive) {
    await prisma.apiKey.update({
      where: { id: byHash.id },
      data: { isActive: true },
    });
    console.log(`\n  ✅ 키 재활성화 완료: ${byHash.id} (${byHash.name})\n`);
    return;
  }

  if (byHash?.isActive) {
    console.log(`\n  ℹ️  키가 이미 활성 상태입니다: ${byHash.id}\n`);
    return;
  }

  // 2. integration-api ID 키가 다른 해시이면 업데이트
  const byId = await prisma.apiKey.findUnique({ where: { id: 'integration-api' } });
  if (byId) {
    await prisma.apiKey.update({
      where: { id: 'integration-api' },
      data: { keyHash, isActive: true },
    });
    console.log(`\n  ✅ integration-api 키 해시 업데이트 + 활성화 완료\n`);
    return;
  }

  console.log(`\n  ❌ 키를 찾을 수 없습니다. create-sync 명령으로 새 키를 생성하세요.\n`);
}

async function createSyncKey() {
  const rawKey = `yjl_${crypto.randomBytes(32).toString('hex')}`;
  const keyHash = hashKey(rawKey);

  const existing = await prisma.apiKey.findUnique({ where: { id: 'sync-production' } });
  if (existing) {
    await prisma.apiKey.update({
      where: { id: 'sync-production' },
      data: {
        keyHash,
        programType: 'external_webhard_sync',
        permissions: ['file/register', 'event/write'],
        isActive: true,
      },
    });
    console.log(`\n  ✅ 기존 sync-production 키 갱신 완료`);
  } else {
    await prisma.apiKey.create({
      data: {
        id: 'sync-production',
        name: 'sync-production',
        keyHash,
        programType: 'external_webhard_sync',
        permissions: ['file/register', 'event/write'],
        isActive: true,
      },
    });
    console.log(`\n  ✅ 새 sync-production 키 생성 완료`);
  }

  console.log(`\n  ⚠️  아래 키를 동기화 앱 설정에 입력하세요 (최초 1회만 표시):`);
  console.log(`\n  ${rawKey}\n`);
  console.log(`  동기화 앱 설정 > 웹하드 연결 > API Key 필드에 붙여넣기\n`);
}

async function main() {
  const command = process.argv[2] ?? 'check';

  try {
    switch (command) {
      case 'list':
        await listKeys();
        break;
      case 'check':
        await checkSyncKey();
        break;
      case 'activate':
        await activateKeys();
        break;
      case 'create-sync':
        await createSyncKey();
        break;
      default:
        console.log(
          `\n  사용법: npx tsx scripts/manage-api-keys.ts [list|check|activate|create-sync]\n`
        );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
