# 장치 Bearer CSRF 경계 및 최신 로컬 빌드 실행 계획

## 목표

중앙 장치 인증을 완료한 데스크톱 프로그램의 표준 Bearer 업무 요청이 전역 CSRF
guard에서 선차단되는 문제를 최소 권한으로 수정하고, 관련 회귀 테스트와 각 활성
프로젝트의 최신 소스 로컬 빌드를 완료한다.

## 보안 경계

- `@RequireDeviceEndpointPolicy`가 선언된 handler만 대상이다.
- 선언된 HTTP method와 실제 요청 method가 일치해야 한다.
- `Authorization`은 정확히 하나의 `Bearer <JWT>` 형식이어야 한다.
- cookie, Origin, Referer, CSRF/session credential 또는 proxy authorization이 섞인
  요청은 기존 CSRF 검증을 유지한다.
- token 유효성, 장치 상태, program type, capability와 permission 검증은 기존 장치
  guard chain이 계속 담당한다.
- 배포, 운영 DB, secret, 장치 상태와 외부 서비스 데이터는 변경하지 않는다.

## 실행 순서

1. `CsrfGuard` 단위 테스트에 정상 Bearer, 잘못된 형식, cookie/Origin 혼용,
   method 불일치, 정책 미선언 행을 추가하고 정상 Bearer 행만 RED인지 확인한다.
2. `CsrfGuard`에 위 보안 경계를 만족하는 좁은 예외를 추가하고 테스트를 GREEN으로
   전환한다.
3. 파일/폴더 장치 endpoint 정책, Bearer guard와 TypeScript/Nest build를 함께
   검증한다.
4. API 계약, 기능 목록, changelog와 진행 로그를 실제 검증 결과에 맞춰 갱신한다.
5. 회사사이트, 외부웹하드동기화프로그램, 레이저네스팅프로그램,
   관리프로그램의 최신 활성 소스와 버전을 확인하고 각 프로젝트 문서의 테스트 및
   로컬 패키징 명령을 실행한다.
6. 변경 diff와 빌드 산출물을 fresh-context로 재검토하고 경로, 버전, 테스트 결과와
   남은 배포 경계를 보고한다.
