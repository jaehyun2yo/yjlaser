# Contact File Upload — 공개 문의 폼 · Worker · Company 업로드 확장자 정책

## 개요

- 목적: 공개 문의 폼, Worker 도면 업로드 모달, Company 포털 도면 업로드 UI 가 동일한 허용 확장자 목록을 공유하도록 단일 상수화한다.
- 도메인: CRM > 문의 관리 > 파일 업로드 UX
- 배경: QA 에서 공개 폼이 `.ai` 파일 업로드를 막는다는 제보가 있었으나, Worker/Company 업로드는 이미 `.ai` 를 허용하고 있었다. 각 UI 가 자체 하드코딩 배열을 갖고 있어 정책 drift 가 발생했다. (task 23 qa-contact-worker-v1)

## 정책

### 단일 상수

- 위치: `src/lib/utils/file-upload-policy.ts` (신규)
- export: `DRAWING_UPLOAD_ALLOWED_EXTENSIONS` (`readonly string[]`) — 도면 업로드용
- export: `DRAWING_UPLOAD_ACCEPT_ATTR` (`string`) — `<input type="file" accept>` 속성에 바로 사용할 수 있는 콤마 구분 문자열
- export: `REFERENCE_UPLOAD_ALLOWED_EXTENSIONS`, `REFERENCE_UPLOAD_ACCEPT_ATTR` — 참고자료(이미지/문서) 업로드용 (도면과 분리 관리)

### 허용 확장자 (도면)

```
.pdf, .dxf, .ai, .dwg, .jpg, .jpeg, .png, .gif, .zip, .rar
```

제조업 도면 파일(PDF, DXF, AI, DWG) + 일반 이미지(JPG/JPEG/PNG/GIF) + 압축(ZIP/RAR) 을 모두 허용한다. `.ai` 는 Adobe Illustrator 포맷으로 업체가 원본 도면을 보낼 때 자주 사용되며, 별도 제한 사유가 없다.

### 허용 확장자 (참고자료)

```
.pdf, .doc, .docx, .jpg, .jpeg, .png, .gif, .webp
```

`REFERENCE_UPLOAD_ALLOWED_EXTENSIONS` 의 정의값. 현재 사용처 없음 (공개 문의 폼은 아래 §공개 문의 폼 정책으로 분리됨). 향후 다른 영역에서 참고자료 화이트리스트가 필요할 때 재사용 목적으로 유지.

### 공개 문의 폼 정책 (블랙리스트)

- 위치: `INQUIRY_BLOCKED_EXTENSIONS = ['.exe']`, `INQUIRY_UPLOAD_ACCEPT_ATTR = ''`
- 적용: `src/app/contact/ContactForm.tsx` 의 `reference_photos` 와 `drawing_file` 두 영역
- 의도: 거래처가 다양한 형식(HWP, ZIP, AI, DXF, 카메라 캡처 등)을 자유롭게 첨부. `.exe` 만 명시적으로 차단.
- 보안: 서버측 magic number 차단(`DANGEROUS_SIGNATURES` — `[0x4d, 0x5a]` 등)이 `.dll`, `.bat`, `.scr` 같은 다른 실행 파일 시그니처를 함께 차단하므로 클라이언트 블랙리스트가 EXE 한 항목으로도 위험을 통제. (`fileValidation.ts:160`)

### 서버측 차단 (독립 레이어)

허용 목록은 클라이언트 UX 용이며, 서버측 위험 확장자 차단은 `src/lib/utils/fileValidation.ts` 의 `DANGEROUS_EXTENSIONS` 로 별도 관리한다:

- `.exe, .bat, .cmd, .scr, .vbs, .js, .jar` 등 실행 가능 바이너리 · 스크립트 → 서버에서 magic byte + 확장자 두 레벨 차단
- 클라이언트 허용 확장자 확대가 서버 차단을 약화시키지 않는다 (서로 독립)

## 적용 지점

| 컴포넌트                                                      | 적용 영역                                                                                          | 정책         |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| `src/app/contact/ContactForm.tsx`                             | `drawing_file` + `reference_photos` 양쪽: `accept=INQUIRY_UPLOAD_ACCEPT_ATTR`, `blockedExtensions` | 블랙리스트   |
| `src/app/contact/_components/ContactCardToggle.tsx`           | `drawing_file` input 의 `accept=DRAWING_UPLOAD_ACCEPT_ATTR`                                        | 화이트리스트 |
| `src/app/worker/_components/WorkerDrawingUpload.tsx`          | 로컬 `ALLOWED_EXTENSIONS` 배열 → 단일 상수 import 로 교체                                          | 화이트리스트 |
| `src/app/company/orders/_components/CompanyDrawingUpload.tsx` | 동일 패턴 단일 상수 import                                                                         | 화이트리스트 |

- 공개 문의 폼(`ContactForm`)은 거래처 다양성을 위해 블랙리스트.
- 내부 작업자/업체 도면 업로드는 도면 워크플로우 일관성을 위해 화이트리스트 유지.
- `FileUpload` 컴포넌트는 `accept` (화이트리스트) 와 `blockedExtensions` (블랙리스트) 를 동시에 받아 둘 다 검증하지만, 둘 중 하나만 지정하면 그 모드만 작동한다.

## 불변 규칙

1. **단일 상수 원칙**: 모든 업로드 정책 상수는 `file-upload-policy.ts` 한 곳에서만 정의한다. UI 컴포넌트 내부에 별도 `ALLOWED_EXTENSIONS` 하드코딩 배열을 두지 않는다.
2. **서버 차단 독립성**: `DANGEROUS_EXTENSIONS` + `DANGEROUS_SIGNATURES` 는 클라이언트 허용/차단 목록과 무관하게 서버에서 차단한다. 클라이언트 `accept`/`blockedExtensions` 는 UX 보조 수단이지 보안 계층이 아니다.
3. **`.ai` 허용 유지**: Adobe Illustrator 파일은 PostScript 기반이나 실행 파일이 아니므로 `DANGEROUS_EXTENSIONS` 에 포함하지 않는다.
4. **공개 폼 vs 내부 도면 정책 분리**: 공개 문의 폼(`ContactForm`)은 블랙리스트(`INQUIRY_BLOCKED_EXTENSIONS`)로 거래처 다양성을 보장. Worker/Company 의 도면 업로드는 화이트리스트(`DRAWING_UPLOAD_ALLOWED_EXTENSIONS`)로 도면 워크플로우 일관성을 보장. 두 정책을 섞어 적용하지 않는다.

## 변경 이력

- 2026-04-24 — 공개 폼 `.ai` 허용 누락 수정 및 단일 상수화 (task 23 qa-contact-worker-v1)
- 2026-04-27 — 공개 문의 폼을 화이트리스트 → 블랙리스트(EXE 만 차단)로 전환. 거래처 피드백으로 HWP·임의 형식 차단 해소. `FileUpload` 컴포넌트에 `blockedExtensions` prop 추가. (task 23 hotfix)

## 참조

- `src/lib/utils/file-upload-policy.ts` — 단일 상수 위치 (task 23 신규)
- `src/lib/utils/fileValidation.ts` — 서버측 `DANGEROUS_EXTENSIONS` 목록
- `docs/specs/features/drawing-workflow.md` — 업로드된 파일의 폴더 저장 정책
- `docs/specs/features/worker-portal.md` §도면 업로드 — Worker 업로드 모달 UX
