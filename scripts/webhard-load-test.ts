/**
 * 웹하드 과부하/성능 테스트 스크립트
 *
 * 사용법:
 * 1. 개발 서버 실행: pnpm dev
 * 2. 테스트 실행: npx tsx scripts/webhard-load-test.ts
 *
 * 환경 변수:
 * - BASE_URL: 테스트 대상 서버 URL (기본값: http://localhost:3000)
 * - CONCURRENT_USERS: 동시 사용자 수 (기본값: 10)
 * - TEST_DURATION_SEC: 테스트 지속 시간 (기본값: 30초)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.CONCURRENT_USERS || '10', 10);
const TEST_DURATION_SEC = parseInt(process.env.TEST_DURATION_SEC || '30', 10);

interface TestResult {
  endpoint: string;
  method: string;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  minResponseTime: number;
  maxResponseTime: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
}

interface RequestLog {
  endpoint: string;
  method: string;
  status: number;
  responseTime: number;
  timestamp: number;
  error?: string;
}

class LoadTester {
  private logs: RequestLog[] = [];
  private running = false;

  async makeRequest(endpoint: string, method: string = 'GET'): Promise<RequestLog> {
    const startTime = Date.now();
    const url = `${BASE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          // 테스트용 인증 쿠키 (실제 환경에서는 세션 쿠키 필요)
          Cookie: 'session=test-session',
        },
      });

      const responseTime = Date.now() - startTime;

      return {
        endpoint,
        method,
        status: response.status,
        responseTime,
        timestamp: startTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        endpoint,
        method,
        status: 0,
        responseTime,
        timestamp: startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async runUserSimulation(userId: number, endpoints: string[]): Promise<void> {
    const endTime = Date.now() + TEST_DURATION_SEC * 1000;

    while (this.running && Date.now() < endTime) {
      // 랜덤 엔드포인트 선택
      const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
      const log = await this.makeRequest(endpoint);
      this.logs.push(log);

      // 실제 사용자처럼 약간의 딜레이 추가 (100ms ~ 500ms)
      await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 400));
    }
  }

  calculateResults(): TestResult[] {
    const resultsByEndpoint = new Map<string, RequestLog[]>();

    // 엔드포인트별로 로그 그룹화
    for (const log of this.logs) {
      const key = `${log.method} ${log.endpoint}`;
      if (!resultsByEndpoint.has(key)) {
        resultsByEndpoint.set(key, []);
      }
      resultsByEndpoint.get(key)!.push(log);
    }

    const results: TestResult[] = [];

    for (const [key, logs] of resultsByEndpoint) {
      const [method, endpoint] = key.split(' ');
      const responseTimes = logs.map((l) => l.responseTime).sort((a, b) => a - b);
      const successLogs = logs.filter((l) => l.status >= 200 && l.status < 300);
      const errorLogs = logs.filter((l) => l.status < 200 || l.status >= 300);

      const p95Index = Math.floor(responseTimes.length * 0.95);
      const p99Index = Math.floor(responseTimes.length * 0.99);

      results.push({
        endpoint,
        method,
        totalRequests: logs.length,
        successCount: successLogs.length,
        errorCount: errorLogs.length,
        minResponseTime: responseTimes[0] || 0,
        maxResponseTime: responseTimes[responseTimes.length - 1] || 0,
        avgResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0,
        p95ResponseTime: responseTimes[p95Index] || 0,
        p99ResponseTime: responseTimes[p99Index] || 0,
        requestsPerSecond: logs.length / TEST_DURATION_SEC,
      });
    }

    return results;
  }

  printResults(results: TestResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 웹하드 성능 테스트 결과');
    console.log('='.repeat(80));
    console.log(`테스트 서버: ${BASE_URL}`);
    console.log(`동시 사용자: ${CONCURRENT_USERS}명`);
    console.log(`테스트 시간: ${TEST_DURATION_SEC}초`);
    console.log(`총 요청 수: ${this.logs.length}`);
    console.log('='.repeat(80) + '\n');

    for (const result of results) {
      console.log(`\n📁 ${result.method} ${result.endpoint}`);
      console.log('-'.repeat(60));
      console.log(`   총 요청: ${result.totalRequests}`);
      console.log(
        `   성공: ${result.successCount} (${((result.successCount / result.totalRequests) * 100).toFixed(1)}%)`
      );
      console.log(
        `   실패: ${result.errorCount} (${((result.errorCount / result.totalRequests) * 100).toFixed(1)}%)`
      );
      console.log(`   응답 시간 (ms):`);
      console.log(`     - 최소: ${result.minResponseTime.toFixed(0)}`);
      console.log(`     - 최대: ${result.maxResponseTime.toFixed(0)}`);
      console.log(`     - 평균: ${result.avgResponseTime.toFixed(0)}`);
      console.log(`     - P95: ${result.p95ResponseTime.toFixed(0)}`);
      console.log(`     - P99: ${result.p99ResponseTime.toFixed(0)}`);
      console.log(`   처리량: ${result.requestsPerSecond.toFixed(2)} req/sec`);
    }

    // 전체 요약
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
    const avgResponseTime = results.reduce((sum, r) => sum + r.avgResponseTime, 0) / results.length;

    console.log('\n' + '='.repeat(80));
    console.log('📈 전체 요약');
    console.log('='.repeat(80));
    console.log(`   전체 성공률: ${((totalSuccess / this.logs.length) * 100).toFixed(1)}%`);
    console.log(`   전체 평균 응답 시간: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`   전체 처리량: ${(this.logs.length / TEST_DURATION_SEC).toFixed(2)} req/sec`);

    // 성능 권장 사항
    console.log('\n' + '='.repeat(80));
    console.log('💡 성능 권장 사항');
    console.log('='.repeat(80));

    if (avgResponseTime > 500) {
      console.log('⚠️  평균 응답 시간이 500ms를 초과합니다. 최적화가 필요합니다.');
    } else if (avgResponseTime > 200) {
      console.log('⚡ 평균 응답 시간이 양호합니다 (200-500ms).');
    } else {
      console.log('✅ 평균 응답 시간이 우수합니다 (<200ms).');
    }

    if (totalErrors > 0) {
      console.log(`⚠️  ${totalErrors}개의 에러가 발생했습니다. 로그를 확인하세요.`);
    }

    const slowEndpoints = results.filter((r) => r.p95ResponseTime > 1000);
    if (slowEndpoints.length > 0) {
      console.log('\n느린 엔드포인트 (P95 > 1초):');
      slowEndpoints.forEach((e) => {
        console.log(`   - ${e.method} ${e.endpoint}: ${e.p95ResponseTime.toFixed(0)}ms`);
      });
    }
  }

  async run(): Promise<void> {
    // 테스트할 엔드포인트 목록
    const endpoints = [
      '/api/webhard/files',
      '/api/webhard/files?sortBy=date&sortOrder=desc',
      '/api/webhard/files?sortBy=name&sortOrder=asc',
      '/api/webhard/files/new',
      '/api/webhard/folders',
      '/api/webhard/folders/batch-undownloaded-count',
    ];

    console.log('🚀 웹하드 성능 테스트 시작...');
    console.log(`   서버: ${BASE_URL}`);
    console.log(`   동시 사용자: ${CONCURRENT_USERS}명`);
    console.log(`   테스트 시간: ${TEST_DURATION_SEC}초`);
    console.log(`   테스트 엔드포인트: ${endpoints.length}개\n`);

    this.running = true;

    // 동시 사용자 시뮬레이션 시작
    const userPromises = Array.from({ length: CONCURRENT_USERS }, (_, i) =>
      this.runUserSimulation(i, endpoints)
    );

    await Promise.all(userPromises);

    this.running = false;

    // 결과 계산 및 출력
    const results = this.calculateResults();
    this.printResults(results);
  }
}

// 스파이크 테스트 (급격한 부하 증가)
class SpikeTester extends LoadTester {
  async runSpikeTest(): Promise<void> {
    console.log('\n⚡ 스파이크 테스트 시작...');
    console.log('   10초 간격으로 부하를 점진적으로 증가시킵니다.\n');

    const endpoints = ['/api/webhard/files', '/api/webhard/folders'];
    const stages = [
      { users: 5, duration: 10 },
      { users: 20, duration: 10 },
      { users: 50, duration: 10 },
      { users: 20, duration: 10 },
      { users: 5, duration: 10 },
    ];

    for (const stage of stages) {
      console.log(`📈 ${stage.users}명 사용자로 ${stage.duration}초 테스트...`);

      const userPromises = Array.from({ length: stage.users }, (_, i) => {
        return new Promise<void>(async (resolve) => {
          const endTime = Date.now() + stage.duration * 1000;
          while (Date.now() < endTime) {
            const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
            await this.makeRequest(endpoint);
            await new Promise((r) => setTimeout(r, 200));
          }
          resolve();
        });
      });

      await Promise.all(userPromises);
    }

    const results = this.calculateResults();
    this.printResults(results);
  }
}

// 연결 테스트 (서버 응답 확인)
async function checkServerConnection(): Promise<boolean> {
  console.log(`🔗 서버 연결 확인 중... (${BASE_URL})`);

  try {
    const response = await fetch(`${BASE_URL}/api/webhard/files`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok || response.status === 401) {
      // 401은 인증 필요로 서버가 정상 동작 중
      console.log('✅ 서버 연결 성공\n');
      return true;
    } else {
      console.log(`⚠️  서버 응답: ${response.status}`);
      return true; // 서버는 응답하고 있음
    }
  } catch (error) {
    console.error('❌ 서버 연결 실패:', error instanceof Error ? error.message : 'Unknown error');
    console.log('\n💡 개발 서버가 실행 중인지 확인하세요: pnpm dev\n');
    return false;
  }
}

// 메인 실행
async function main() {
  console.log('\n' + '🔧'.repeat(40));
  console.log('       웹하드 과부하/성능 테스트 도구');
  console.log('🔧'.repeat(40) + '\n');

  // 서버 연결 확인
  const isConnected = await checkServerConnection();
  if (!isConnected) {
    process.exit(1);
  }

  // 테스트 유형 선택
  const testType = process.argv[2] || 'load';

  switch (testType) {
    case 'load':
      console.log('📊 부하 테스트 (Load Test) 실행');
      const loadTester = new LoadTester();
      await loadTester.run();
      break;

    case 'spike':
      console.log('⚡ 스파이크 테스트 (Spike Test) 실행');
      const spikeTester = new SpikeTester();
      await spikeTester.runSpikeTest();
      break;

    default:
      console.log('사용법: npx tsx scripts/webhard-load-test.ts [load|spike]');
      console.log('  load  - 일반 부하 테스트');
      console.log('  spike - 스파이크 테스트 (급격한 부하 변화)');
  }
}

main().catch(console.error);
