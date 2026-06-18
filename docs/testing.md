# Testing Strategy

## 원칙

- **순수 로직에 집중**: mock으로 접착제 코드를 테스트하지 않는다. 구현을 두 번 쓰는 것이지 동작을 검증하는 게 아니다.
- **커버리지 숫자 목표 없음**: 숫자를 채우기 위한 mock 테스트 양산은 시간 낭비. 깨지면 치명적인 분기만 커버.
- **구현과 테스트를 함께 작성**: 모듈 구현 직후 해당 테스트를 작성한다. 일괄 작성 금지.

## 실행 커맨드

### Frontend (Next.js)

```bash
pnpm test                              # 전체 Jest 테스트
pnpm test -- --testPathPattern="<path>" # 특정 경로만
npx tsc --noEmit                        # 타입 체크
```

### Backend (NestJS)

```bash
cd webhard-api && pnpm test             # 전체 Jest 테스트
cd webhard-api && pnpm build            # 빌드 검증
cd webhard-api && npx prisma migrate dev --name {name}  # 마이그레이션 생성
cd webhard-api && npx prisma db seed    # 시드 데이터 삽입
```

### E2E

```bash
npx playwright test                     # 전체 E2E
npx playwright test <spec-file>         # 특정 스펙만
```

### 통합 검증

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build
```

## 테스트 위치

- Frontend: `src/__tests__/` (기능별 하위 디렉토리)
- Backend: `webhard-api/src/**/*.spec.ts`
- E2E: `e2e/`
