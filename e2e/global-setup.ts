import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const MIN_AUTH_REUSE_SECONDS = 60 * 60;
const E2E_SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';
const PRODUCTION_RESOURCE_PATTERNS = [
  'ibsbcuumkdhwesrpaqeb',
  'webhard-api-production',
  'yjlaser.net',
  'vercel.app',
  'production',
];

interface StoredCookie {
  name: string;
  expires?: number;
}

interface StoredState {
  cookies?: StoredCookie[];
}

interface GeneratedStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Lax';
  }>;
  origins: [];
}

function getStoredAdminSessionExpires(authFile: string): number | null {
  try {
    const state = JSON.parse(fs.readFileSync(authFile, 'utf8')) as StoredState;
    const cookie = state.cookies?.find((item) => item.name === 'admin-session');
    return typeof cookie?.expires === 'number' ? cookie.expires : null;
  } catch {
    return null;
  }
}

function signSessionData(tokenAndData: string, sessionSecret: string): string {
  const hmac = crypto.createHmac('sha256', sessionSecret);
  hmac.update(tokenAndData);
  return hmac.digest('hex');
}

function getE2ESessionSecret(): string | null {
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET_SENTINEL) {
    return sessionSecret;
  }

  const strictRuntime =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (strictRuntime) {
    return null;
  }

  return DEV_ONLY_SESSION_SECRET;
}

function createAdminStorageState(baseURL: string, authFile: string): boolean {
  const sessionSecret = getE2ESessionSecret();
  if (!sessionSecret) {
    return false;
  }

  const url = new URL(baseURL);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionData = JSON.stringify({
    kind: 'browser',
    userType: 'admin',
    userId: 'admin',
    iat: nowSeconds,
    exp: nowSeconds + E2E_SESSION_MAX_AGE_SECONDS,
  });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenAndData = `${token}:${sessionData}`;
  const signature = signSessionData(tokenAndData, sessionSecret);

  const state: GeneratedStorageState = {
    cookies: [
      {
        name: 'admin-session',
        value: `${encodeURIComponent(tokenAndData)}.${signature}`,
        domain: url.hostname,
        path: '/',
        expires: nowSeconds + E2E_SESSION_MAX_AGE_SECONDS,
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
      },
    ],
    origins: [],
  };

  fs.writeFileSync(authFile, JSON.stringify(state, null, 2));
  return true;
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
  } catch {
    return false;
  }
}

function isProductionLikeValue(value: string): boolean {
  const normalized = value.toLowerCase();
  return PRODUCTION_RESOURCE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function extractSupabaseRefs(value: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /https?:\/\/([a-z0-9]{20})\.supabase\.co/gi,
    /(?:^|[.@:/])([a-z0-9]{20})\.supabase\.co/gi,
    /(?:^|[.@:/])db\.([a-z0-9]{20})\.supabase\.co/gi,
    /postgres(?:ql)?:\/\/[^:@/\s]*[.:]([a-z0-9]{20})(?=[:@])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      refs.add(match[1].toLowerCase());
    }
  }
  return [...refs];
}

function supabaseRefEntries(entries: Array<readonly [string, string | undefined]>): Array<{
  name: string;
  ref: string;
}> {
  const refs: Array<{ name: string; ref: string }> = [];
  for (const [name, value] of entries) {
    if (!value) continue;
    for (const ref of extractSupabaseRefs(String(value))) {
      refs.push({ name, ref });
    }
  }
  return refs;
}

function isOperationalE2ERun(): boolean {
  return (
    process.env.OPERATIONAL_E2E_STRICT_ENV_FILE_CHECK === 'true' ||
    process.argv.some(
      (arg) =>
        arg.includes('ui-operational-workflow-v2.spec.ts') ||
        arg.includes('ui-operational-workflow-user.spec.ts')
    )
  );
}

function displayAuthFile(authFile: string): string {
  return isOperationalE2ERun() ? '<authFile>' : authFile;
}

function assertE2ESafetyBeforeSeed(baseURL: string): void {
  const strictRuntime =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (strictRuntime) {
    throw new Error('Playwright E2E seed is blocked in production-like runtime');
  }

  const apiURL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
  const runtimeUrlEntries = [
    ['baseURL', baseURL],
    ['NEXT_PUBLIC_WEBHARD_API_URL', apiURL],
  ] as Array<readonly [string, string]>;
  const unsafeRuntimeUrls = runtimeUrlEntries.filter(([, value]) => isProductionLikeValue(value));
  if (unsafeRuntimeUrls.length > 0) {
    throw new Error(
      `Playwright E2E seed blocked by production API/Web URL denylist: ${unsafeRuntimeUrls
        .map(([name]) => name)
        .join(', ')}`
    );
  }

  const allowRemote = process.env.ALLOW_REMOTE_OPERATIONAL_E2E === 'true';
  const hasNonLoopbackRuntimeUrl = !isLoopbackUrl(baseURL) || !isLoopbackUrl(apiURL);
  if (!allowRemote && hasNonLoopbackRuntimeUrl) {
    throw new Error('Playwright E2E seed is local-only by default');
  }
  if (
    allowRemote &&
    hasNonLoopbackRuntimeUrl &&
    !process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF?.trim()
  ) {
    throw new Error('Remote Playwright E2E seed requires OPERATIONAL_E2E_EXPECTED_SUPABASE_REF');
  }
  if (allowRemote && hasNonLoopbackRuntimeUrl) {
    const expectedRef = process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF?.trim() ?? '';
    if (!/^[a-z0-9]{20}$/.test(expectedRef)) {
      throw new Error('OPERATIONAL_E2E_EXPECTED_SUPABASE_REF must be a 20-character Supabase ref');
    }
    const mismatches = supabaseRefEntries(runtimeUrlEntries).filter(
      (entry) => entry.ref !== expectedRef
    );
    if (mismatches.length > 0) {
      throw new Error(
        `Remote Playwright E2E seed blocked by Supabase ref mismatch: ${mismatches
          .map((entry) => entry.name)
          .join(', ')}`
      );
    }
  }

  const dbEntries = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
    .map((name) => [name, process.env[name]] as const)
    .filter(([, value]) => Boolean(value));
  const unsafeDb = dbEntries.filter(([, value]) => isProductionLikeValue(String(value)));
  if (unsafeDb.length > 0) {
    throw new Error(
      `Playwright E2E seed blocked by production DB/resource denylist: ${unsafeDb
        .map(([name]) => name)
        .join(', ')}`
    );
  }
  const dbRefs = supabaseRefEntries(dbEntries);
  if (
    dbEntries.some(([, value]) => String(value).toLowerCase().includes('supabase')) &&
    dbRefs.length === 0
  ) {
    throw new Error('Playwright E2E seed requires parseable Supabase DB ref');
  }
  if (dbRefs.length > 0) {
    const expectedRef = process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF?.trim() ?? '';
    const dbRefMismatches = dbRefs.filter((entry) => entry.ref !== expectedRef);
    if (!/^[a-z0-9]{20}$/.test(expectedRef)) {
      throw new Error('Supabase DB URL requires OPERATIONAL_E2E_EXPECTED_SUPABASE_REF');
    }
    if (dbRefMismatches.length > 0) {
      throw new Error(
        `Playwright E2E seed blocked by DB Supabase ref mismatch: ${dbRefMismatches
          .map((entry) => entry.name)
          .join(', ')}`
      );
    }
  }

  if (isOperationalE2ERun()) {
    const mockFlags = [
      'OPERATIONAL_E2E_MOCK_LGUPLUS',
      'OPERATIONAL_E2E_MOCK_POPBILL',
      'OPERATIONAL_E2E_MOCK_STORAGE',
    ];
    const missingMocks = mockFlags.filter((name) => process.env[name] !== 'true');
    if (missingMocks.length > 0) {
      throw new Error(`Operational Playwright E2E requires mock flags: ${missingMocks.join(', ')}`);
    }
    const externalCredentialNames = Object.keys(process.env).filter(
      (name) =>
        process.env[name] &&
        /^(POPBILL|LGUPLUS|GOOGLE_DRIVE|GOOGLE_APPLICATION_CREDENTIALS|R2_|AWS_)/i.test(name)
    );
    if (externalCredentialNames.length > 0) {
      throw new Error(
        `Operational Playwright E2E refuses external credential env vars: ${externalCredentialNames.join(', ')}`
      );
    }
  }

  if (process.env.SKIP_E2E_DB_SEED !== 'true' && dbEntries.length === 0) {
    throw new Error('Playwright E2E seed requires explicit dev/test DATABASE_URL or Supabase URL');
  }
}

function seedE2EDatabase(): void {
  if (process.env.SKIP_E2E_DB_SEED === 'true') {
    console.log('⚠️ SKIP_E2E_DB_SEED=true - E2E DB seed를 건너뜁니다.');
    return;
  }

  console.log('🌱 E2E DB seed 실행 중...');
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm.cmd --dir webhard-api db:seed'], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.stdout) {
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`E2E DB seed failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function isStoredAuthStateValid(baseURL: string, authFile: string): Promise<boolean> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/webhard`, { timeout: 30000 });
    await page.waitForLoadState('domcontentloaded');
    return !page.url().includes('/login');
  } catch {
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Playwright Global Setup
 *
 * 모든 테스트 실행 전 1번만 로그인하고 인증 상태를 파일로 저장합니다.
 *
 * 저장 경로: .auth/user.json
 *
 * 이 방식의 장점:
 * - ✅ 37개 테스트 → 단 1번만 로그인
 * - ✅ Worker 재시작 영향 없음 (파일 기반)
 * - ✅ CI/CD에서도 안정적
 * - ✅ Rate Limit 문제 완전 해결
 */
async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000';
  const authFile = path.join(__dirname, '..', '.auth', 'user.json');

  assertE2ESafetyBeforeSeed(baseURL);
  seedE2EDatabase();

  // .auth 디렉토리 생성
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // 기존 인증 상태 파일이 있고 세션 만료까지 충분한 시간이 남았으면 재사용
  if (fs.existsSync(authFile)) {
    const stats = fs.statSync(authFile);
    const ageInHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
    const expiresAt = getStoredAdminSessionExpires(authFile);
    const remainingSeconds = expiresAt === null ? null : expiresAt - Math.floor(Date.now() / 1000);

    if (ageInHours < 24 && remainingSeconds !== null && remainingSeconds > MIN_AUTH_REUSE_SECONDS) {
      console.log('✅ 기존 인증 상태 재사용 (세션 만료까지 60분 이상 남음)');
      console.log(`   파일: ${displayAuthFile(authFile)}`);
      console.log(`   생성: ${Math.round(ageInHours * 60)}분 전`);
      console.log(`   남은 세션: ${Math.round(remainingSeconds / 60)}분`);

      if (await isStoredAuthStateValid(baseURL, authFile)) {
        console.log('✅ 인증 상태 유효 - 로그인 스킵');
        return;
      }

      console.log('⚠️ 인증 상태 만료 - 재생성 필요');
    } else {
      console.log('⚠️ 인증 상태가 곧 만료되거나 만료됨 - 재로그인 필요');
      console.log(`   생성: ${Math.round(ageInHours * 60)}분 전`);
      if (remainingSeconds !== null) {
        console.log(`   남은 세션: ${Math.round(remainingSeconds / 60)}분`);
      }
    }
  }

  console.log('🔐 Global Setup: E2E 관리자 세션 생성 중...');
  const didCreateAdminSession = createAdminStorageState(baseURL, authFile);

  if (didCreateAdminSession && (await isStoredAuthStateValid(baseURL, authFile))) {
    console.log(`✅ 인증 상태 저장 완료: ${displayAuthFile(authFile)}`);
    console.log('✅ Global Setup 완료 - 이제 모든 테스트가 이 세션을 재사용합니다.');
    return;
  }

  if (didCreateAdminSession) {
    console.log('⚠️ 생성된 E2E 세션 검증 실패 - 로그인 폼으로 재시도합니다.');
  } else {
    console.log('⚠️ E2E 세션 직접 생성 불가 - 로그인 폼으로 재시도합니다.');
  }

  // 브라우저 실행
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 로그인 페이지 이동
    await page.goto(`${baseURL}/login`);

    // Rate Limit 에러 확인
    const url = page.url();
    if (url.includes('rate_limit')) {
      console.error('❌ Rate Limit 차단됨 - 기존 인증 상태 파일을 사용하거나 Rate Limit 해제 필요');
      console.log('💡 해결 방법:');
      console.log('   1. Supabase에서 rate_limit_attempts 테이블 삭제');
      console.log('   2. 또는 .auth/user.json 파일을 수동으로 유효한 상태로 설정');
      throw new Error('Rate Limit exceeded - cannot login');
    }

    // 로그인 폼 작성
    await page.fill('input[name="username"]', process.env.TEST_ADMIN_USERNAME || 'test_admin');
    await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD || 'test_admin123');

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');

    // 로그인 완료 대기
    await page.waitForURL(/\/(admin|dashboard|webhard)/, { timeout: 30000 });

    console.log('✅ 로그인 성공! 인증 상태 저장 중...');

    // 인증 상태 저장
    await context.storageState({ path: authFile });

    console.log(`✅ 인증 상태 저장 완료: ${displayAuthFile(authFile)}`);
    console.log('✅ Global Setup 완료 - 이제 모든 테스트가 이 세션을 재사용합니다.');
  } catch (error) {
    console.error('❌ Global Setup 실패:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
