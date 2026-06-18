/**
 * E2E 테스트 환경 설정
 * (환경 변수는 env-setup.ts에서 로드됨)
 */

// Jest 타임아웃 설정
jest.setTimeout(30000);

// 테스트 후 정리
afterAll(async () => {
  // 필요시 정리 로직 추가
});
