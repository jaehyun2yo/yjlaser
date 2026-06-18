# Phase 1: 파일 업로드 허용 확장자 정책 통합 (upload-ext-policy)

## 사전 준비

먼저 아래 문서들을 반드시 읽어라:

- `docs/specs/features/contact-file-upload.md` — **이번 phase 의 스펙**. 허용 확장자 목록, 단일 상수 위치, 적용 지점이 모두 여기 있다.
- `/tasks/23-qa-contact-worker-v1/docs-diff.md` — Phase 0 문서 변경 기록.
- `src/lib/utils/fileValidation.ts` — 서버측 `DANGEROUS_EXTENSIONS` 목록. 업로드 UI 허용과 독립적으로 유지되는 안전망.
- `CLAUDE.md` (project root) — 한글 응답, No `any`, 단일 상수화 원칙.

그리고 현재 구조를 이해하라:

- `src/app/contact/ContactForm.tsx:1367` — `drawing_file` accept 속성 (현재 `.pdf,.dwg,.dxf,.jpg,.jpeg,.png,.gif,.zip,.rar` — `.ai` 누락이 이슈 1 의 근본 원인).
- `src/app/contact/ContactForm.tsx:1165` — `reference_photos` accept (`image/*,.pdf,.doc,.docx`).
- `src/app/contact/_components/ContactCardToggle.tsx:641` — `drawing_file` accept (`image/*,.pdf,.doc,.docx`).
- `src/app/worker/_components/WorkerDrawingUpload.tsx:15` — `ALLOWED_EXTENSIONS` 하드코딩 배열.
- `src/app/company/orders/_components/CompanyDrawingUpload.tsx:14` — 동일 패턴 하드코딩.

## 작업 내용

### 1. `src/lib/utils/file-upload-policy.ts` (신규)

단일 진입점 상수 파일을 생성한다.

시그니처:

```ts
/**
 * 도면 업로드 허용 확장자. 프론트엔드 accept 속성과 클라이언트 사이드 검증에 사용.
 * 서버측 DANGEROUS_EXTENSIONS 차단은 src/lib/utils/fileValidation.ts 에서 별도 관리.
 */
export const DRAWING_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.dxf',
  '.ai',
  '.dwg',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.zip',
  '.rar',
] as const;

/**
 * input[type=file] accept 속성에 직접 사용할 수 있는 콤마 구분 문자열.
 */
export const DRAWING_UPLOAD_ACCEPT_ATTR: string = DRAWING_UPLOAD_ALLOWED_EXTENSIONS.join(',');

/**
 * 참고자료(이미지/문서) 업로드 허용 확장자. 도면과 구분해서 관리.
 */
export const REFERENCE_UPLOAD_ALLOWED_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.doc',
  '.docx',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
] as const;

export const REFERENCE_UPLOAD_ACCEPT_ATTR: string =
  REFERENCE_UPLOAD_ALLOWED_EXTENSIONS.join(',') + ',image/*';
```

`readonly` 배열 + `as const` 로 컴파일 타임 불변성 보장. 타입 추론은 TypeScript 에 맡김.

### 2. `src/app/contact/ContactForm.tsx` accept 속성 교체

- Line ~1367 (drawing_file input): `accept=".pdf,.dwg,..."` 를 `accept={DRAWING_UPLOAD_ACCEPT_ATTR}` 로 교체.
- Line ~1165 (reference_photos input): `accept="image/*,.pdf,.doc,.docx"` 를 `accept={REFERENCE_UPLOAD_ACCEPT_ATTR}` 로 교체.
- 상단 import 추가: `import { DRAWING_UPLOAD_ACCEPT_ATTR, REFERENCE_UPLOAD_ACCEPT_ATTR } from '@/lib/utils/file-upload-policy';`

### 3. `src/app/contact/_components/ContactCardToggle.tsx`

Line ~641 (drawing_file input): 동일하게 `DRAWING_UPLOAD_ACCEPT_ATTR` 사용.

### 4. `src/app/worker/_components/WorkerDrawingUpload.tsx`

Line ~15 의 로컬 `const ALLOWED_EXTENSIONS = [...]` 선언을 **제거**하고 상단 import 로 `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` 사용. 파일 내부에서 확장자 검증 로직이 있으면 이 상수를 참조.

변수명 충돌이 발생하면 alias: `import { DRAWING_UPLOAD_ALLOWED_EXTENSIONS as ALLOWED_EXTENSIONS } from '@/lib/utils/file-upload-policy';`

### 5. `src/app/company/orders/_components/CompanyDrawingUpload.tsx`

Line ~14 동일 패턴 제거 → 중앙 상수 사용.

### 6. (선택) 서버측 fileValidation.ts 와의 정합성 검증

`src/lib/utils/fileValidation.ts` 의 `DANGEROUS_EXTENSIONS` 에 `.ai` 가 포함되어 있지 않은지 확인 (AI 파일은 PostScript 기반이지만 실행 파일 아니므로 안전해야 함). 만약 포함되어 있다면 제거. 보통 exe, bat, cmd, scr, vbs, js, jar, sh, ps1 등이 들어있다.

## Acceptance Criteria

프론트엔드만 건드리는 phase 이므로 아래 커맨드로 검증:

```bash
pnpm build
```

```bash
npx tsc --noEmit
```

```bash
pnpm test
```

3 개 커맨드 모두 통과해야 한다.

## AC 검증 방법

위 3 커맨드를 **병렬 실행** (단일 assistant 메시지 + Bash 3 개) 하여 모두 통과 시 `/tasks/23-qa-contact-worker-v1/index.json` 의 phase 1 status 를 `"completed"` 로 변경.

수정 3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **기존 업로드 UI 동작을 바꾸지 마라**. 단지 accept 소스만 단일 상수로 교체. 파일 검증 로직(크기 제한, magic byte 등) 은 건드리지 않음.
- `src/lib/utils/file-upload-policy.ts` 파일이 이미 있으면 중복 생성하지 말고 **기존 파일에 상수 추가**.
- Worker/Company 업로드에 이미 `ALLOWED_EXTENSIONS` 라는 로컬 상수가 있을 수 있다. 동일 이름 충돌 피하려면 alias 사용하되, 변수 참조처도 모두 수정하여 일관성 유지.
- `accept` 속성에 `image/*` 같은 와일드카드 혼용은 reference_photos 만 유지. drawing_file 은 명시적 확장자 목록만 사용 (브라우저 파일 선택기 UX 일관성).
- 서버측 차단(`DANGEROUS_EXTENSIONS`) 과 클라이언트 허용은 **서로 독립적으로 유지**. 클라이언트 허용 확대가 서버측 차단을 약화시키지 않아야 한다.
- 한글 커밋: `feat(qa-contact-worker-v1): phase 1 — upload-ext-policy`.
