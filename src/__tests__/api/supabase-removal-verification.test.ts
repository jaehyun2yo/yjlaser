/**
 * Phase 6: Supabase 제거 검증 테스트
 *
 * DB 리팩토링 완료 후 Supabase 참조가 완전히 제거되었는지 검증합니다.
 * 이 테스트는 Phase 6에서 Supabase를 제거한 후에 통과하도록 설계되었습니다.
 *
 * 현재(Phase 4 이전)는 SKIP 상태이며,
 * Phase 6 완료 시 .skip을 제거하고 실행합니다.
 *
 * @jest-environment node
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================
// Helpers
// ============================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../..');

function grepInProject(pattern: string, includes: string[]): string[] {
  const includeArgs = includes.map((i) => `--include="${i}"`).join(' ');
  try {
    const result = execSync(
      `grep -r "${pattern}" ${includeArgs} --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=__tests__ --exclude-dir=coverage -l "${PROJECT_ROOT}/src"`,
      { encoding: 'utf-8', timeout: 30000 }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch {
    // grep returns exit code 1 when no matches found
    return [];
  }
}

function readPackageJson(): Record<string, Record<string, string>> {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8');
  return JSON.parse(content);
}

// ============================================================
// Tests (Phase 6 이후 .skip 제거)
// ============================================================

describe('Phase 6: Supabase 제거 검증', () => {
  describe('소스 코드에서 Supabase 참조 제거 확인', () => {
    it('src/ 내 .from() 호출이 없어야 함 (Supabase query builder)', () => {
      const files = grepInProject('supabase.*\\.from(', ['*.ts', '*.tsx']);

      expect(files).toHaveLength(0);
    });

    it('src/ 내 createSupabaseServerClient 참조가 없어야 함', () => {
      const files = grepInProject('createSupabaseServerClient', ['*.ts', '*.tsx']);

      expect(files).toHaveLength(0);
    });

    it('src/ 내 @supabase 임포트가 없어야 함', () => {
      const files = grepInProject('@supabase/', ['*.ts', '*.tsx']);

      expect(files).toHaveLength(0);
    });

    it('src/ 내 supabase.rpc() 호출이 없어야 함', () => {
      const files = grepInProject('supabase.*\\.rpc(', ['*.ts', '*.tsx']);

      expect(files).toHaveLength(0);
    });

    it('src/ 내 Supabase Realtime 참조가 없어야 함', () => {
      const channelFiles = grepInProject('supabase.*\\.channel(', ['*.ts', '*.tsx']);
      const realtimeFiles = grepInProject('RealtimeChannel|RealtimePostgresChangesPayload', [
        '*.ts',
        '*.tsx',
      ]);

      expect([...channelFiles, ...realtimeFiles]).toHaveLength(0);
    });
  });

  describe('환경변수 정리 확인', () => {
    it('NEXT_PUBLIC_SUPABASE_ 환경변수가 필수가 아니어야 함', () => {
      // Supabase 제거 후에는 이 변수 없이도 앱이 시작 가능해야 함
      // 실제로는 빌드 테스트로 확인하지만, 여기서는 참조만 확인

      const files = grepInProject('NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY', [
        '*.ts',
        '*.tsx',
      ]);

      // .env 파일, 설정 파일은 제외하고 런타임 코드에서만 확인
      const runtimeFiles = files.filter((f) => !f.includes('.env') && !f.includes('config'));

      expect(runtimeFiles).toHaveLength(0);
    });
  });

  describe('패키지 의존성 정리 확인', () => {
    it('package.json에 @supabase 패키지가 없어야 함', () => {
      const pkg = readPackageJson();
      const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };

      const supabaseDeps = Object.keys(allDeps).filter((dep) => dep.startsWith('@supabase/'));

      expect(supabaseDeps).toHaveLength(0);
    });
  });

  describe('Supabase 관련 유틸리티 파일 제거 확인', () => {
    it('lib/supabase/ 디렉토리가 비어있거나 없어야 함', () => {
      const supabaseDir = path.join(PROJECT_ROOT, 'src', 'lib', 'supabase');

      if (fs.existsSync(supabaseDir)) {
        const files = fs.readdirSync(supabaseDir).filter(
          (f) => !f.startsWith('.') // hidden files 제외
        );
        expect(files).toHaveLength(0);
      }
      // 디렉토리 자체가 없으면 통과
    });
  });
});

/**
 * 현재 상태 확인용 테스트 (항상 실행)
 * Phase 4~5 진행 중 Supabase 사용 현황을 추적합니다.
 */
describe('Supabase 사용 현황 모니터링', () => {
  it('현재 Supabase 사용 파일 수를 기록해야 함', () => {
    const files = grepInProject('createSupabaseServerClient\\|@supabase/', ['*.ts', '*.tsx']);

    // 현재 상태를 기록 — Phase 4~5 진행에 따라 줄어들어야 함
    // Phase 0~2 완료 시점의 기준값 설정
    // 이 테스트는 항상 pass하며, 숫자 변화를 추적하는 용도
    expect(typeof files.length).toBe('number');
  });
});
