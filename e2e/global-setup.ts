import { chromium, FullConfig } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

const MIN_AUTH_REUSE_SECONDS = 60 * 60;
const E2E_SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';

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
      console.log(`   파일: ${authFile}`);
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
    console.log(`✅ 인증 상태 저장 완료: ${authFile}`);
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

    console.log(`✅ 인증 상태 저장 완료: ${authFile}`);
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
