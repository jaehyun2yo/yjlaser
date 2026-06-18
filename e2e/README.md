# 웹하드 E2E 테스트 가이드

## 📋 개요

웹하드 파일 작업(업로드, 삭제, 수정)에 대한 포괄적인 E2E 테스트입니다.

- **업로드 테스트**: 15개
- **삭제 테스트**: 12개
- **수정 테스트**: 10개

**총 37개 테스트 케이스**

---

## 🔧 사전 준비

### 1. 환경 변수 설정

`.env.local` 파일에 테스트 계정 정보를 추가하세요:

```env
# 기존 설정
TEST_ADMIN_USERNAME=test_admin
TEST_ADMIN_PASSWORD_HASH_B64=...

# ⚠️ 추가 필요
TEST_ADMIN_PASSWORD=실제_비밀번호
```

**비밀번호를 모르는 경우:**
1. Supabase 대시보드에서 `test_admin` 계정의 비밀번호를 재설정하거나
2. 새로운 테스트 계정 생성

### 2. Playwright 설치

처음 실행하는 경우 Playwright 브라우저를 설치해야 합니다:

```bash
npx playwright install
```

---

## 🚀 테스트 실행

### 전체 테스트 실행

```bash
npx playwright test e2e/webhard-file-operations.spec.ts
```

### 특정 브라우저에서만 실행

```bash
# Chromium만
npx playwright test e2e/webhard-file-operations.spec.ts --project=chromium

# Firefox만
npx playwright test e2e/webhard-file-operations.spec.ts --project=firefox

# WebKit만
npx playwright test e2e/webhard-file-operations.spec.ts --project=webkit
```

### 특정 테스트만 실행

```bash
# 업로드 테스트만
npx playwright test e2e/webhard-file-operations.spec.ts -g "upload"

# 삭제 테스트만
npx playwright test e2e/webhard-file-operations.spec.ts -g "delete"

# 수정 테스트만
npx playwright test e2e/webhard-file-operations.spec.ts -g "rename"

# 특정 테스트 1개만
npx playwright test e2e/webhard-file-operations.spec.ts -g "should upload single small file"
```

### UI 모드 (디버깅)

```bash
npx playwright test e2e/webhard-file-operations.spec.ts --ui
```

### Headed 모드 (브라우저 보면서 실행)

```bash
npx playwright test e2e/webhard-file-operations.spec.ts --headed
```

---

## 📂 파일 구조

```
e2e/
├── global-setup.ts             # ⭐ 1번만 로그인, auth state 저장
├── fixtures/
│   └── auth.ts                 # ⭐ 저장된 auth state 로드
├── helpers/
│   ├── file-helpers.ts         # 테스트 파일 생성 유틸리티
│   └── webhard-helpers.ts      # 웹하드 작업 헬퍼 함수
├── webhard-file-operations.spec.ts  # 37개 메인 테스트
├── webhard.spec.ts             # 기존 UI/네비게이션 테스트
├── security.spec.ts            # 보안 테스트
└── README.md                   # 이 파일

.auth/                          # ⭐ 저장된 인증 상태 (gitignored)
└── user.json                   # 로그인 세션 정보
```

### 🔐 인증 방식 (Global Setup)

**문제**: 37개 테스트가 각각 로그인 → Rate Limit 발생 (13-15분 차단)

**해결**: Global Setup 패턴 사용
1. `global-setup.ts`: 모든 테스트 실행 전 1번만 로그인
2. `.auth/user.json`: 인증 상태를 파일로 저장
3. `fixtures/auth.ts`: 저장된 상태를 모든 테스트에서 재사용

**결과**: ✅ 37개 테스트 → 단 1번만 로그인!

---

## 🧪 테스트 상세

### 업로드 테스트 (15개)

**단일 파일 업로드 (5개)**
- 소형 파일 (<1MB)
- 중형 파일 (5-10MB)
- 허용 파일 타입 (DXF, JPG)
- 비허용 파일 타입 (EXE)

**대용량 파일 (3개)**
- 15MB+ 파일
- 100MB+ 파일
- 2GB 제한 검증

**배치 업로드 (5개)**
- 5개 동시 업로드
- 15개 동시 업로드
- 100개 최대 제한
- 101개 초과 거부
- 혼합 파일 타입

**드래그 앤 드롭 (2개)**
- 기본 드래그 앤 드롭
- 특정 폴더로 드롭

### 삭제 테스트 (12개)

**단일 삭제 (4개)**
- 컨텍스트 메뉴
- 파일 아이템 휴지통 아이콘
- 툴바 삭제 버튼
- 방금 업로드한 파일

**배치 삭제 (5개)**
- 5개 파일
- 10개 파일
- 20개 파일
- 전체 삭제 (Empty State)
- ProgressModal 표시

**에러 케이스 (3개)**
- 존재하지 않는 파일
- 네트워크 실패
- 롤백 처리

### 수정 테스트 (10개)

**기본 수정 (4개)**
- Enter 키로 저장
- Blur로 저장
- ESC로 취소
- 인라인 편집 모드

**검증 (4개)**
- 빈 문자열 거부
- 공백만 있는 문자열 거부
- 특수문자 sanitize
- 중복 파일명 처리

**에러 케이스 (2개)**
- 권한 없음
- 네트워크 실패

---

## ⏱️ 타임아웃 설정

- **기본 테스트**: 120초
- **대용량 업로드**: 180초
- **매우 큰 파일**: 300초 (100개 배치)

`playwright.config.ts`에서 전역 타임아웃 설정:

```typescript
timeout: 120 * 1000, // 120 seconds
```

개별 테스트에서 타임아웃 조정:

```typescript
test('대용량 파일 업로드', async ({ page }) => {
  test.setTimeout(180000); // 180초
  // ...
});
```

---

## 🐛 디버깅

### 스크린샷 확인

실패한 테스트의 스크린샷은 자동으로 저장됩니다:

```
test-results/
└── [테스트명]-[브라우저]/
    ├── test-failed-1.png
    └── error-context.md
```

### HTML 리포트

```bash
npx playwright show-report
```

### 특정 테스트 디버깅

```bash
npx playwright test e2e/webhard-file-operations.spec.ts -g "실패한 테스트명" --debug
```

---

## 📊 테스트 결과

### 성공 시나리오
- ✅ 37개 테스트 모두 통과
- ✅ 파일 업로드 → UI 반영 확인
- ✅ 파일 삭제 → UI에서 제거 확인
- ✅ 파일 수정 → 새 이름 표시 확인

### 실패 가능 시나리오
- ⚠️ 타임아웃 (대용량 파일 업로드)
- ⚠️ 로그인 실패 (자격 증명 문제)
- ⚠️ API 에러 (서버 문제)

---

## 🔑 환경 변수 전체 목록

```env
# 테스트 계정 (필수)
TEST_ADMIN_USERNAME=test_admin
TEST_ADMIN_PASSWORD=실제_비밀번호

# Supabase (자동 로드됨)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Cloudflare R2 (자동 로드됨)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

---

## 💡 팁

### 빠른 실행을 위한 추천

1. **특정 브라우저만 사용**:
   ```bash
   npx playwright test --project=chromium
   ```

2. **병렬 실행 제한** (안정성 우선):
   ```bash
   npx playwright test --workers=1
   ```

3. **헤드리스 모드** (CI/CD용):
   ```bash
   npx playwright test --headed=false
   ```

### CI/CD 통합

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install --with-deps
      - run: npx playwright test e2e/webhard-file-operations.spec.ts
        env:
          TEST_ADMIN_USERNAME: ${{ secrets.TEST_ADMIN_USERNAME }}
          TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
```

---

## 📞 문제 해결

### "Cannot find module" 에러

```bash
npm install
npx playwright install
```

### "Timeout exceeded" 에러

- 네트워크 속도 확인
- `timeout` 값 증가
- 로컬 서버 확인 (`npm run dev`)

### "Login failed" 에러

- `.env.local`에 `TEST_ADMIN_PASSWORD` 추가
- 비밀번호가 올바른지 확인
- 테스트 계정이 활성화되어 있는지 확인

---

## 📝 참고 자료

- [Playwright 공식 문서](https://playwright.dev)
- [테스트 실행 가이드](https://playwright.dev/docs/running-tests)
- [디버깅 가이드](https://playwright.dev/docs/debug)
