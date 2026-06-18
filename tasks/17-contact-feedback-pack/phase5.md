# Phase 5: urgent-siren-overlay

## 사전 준비

- `docs/specs/features/contact-urgent-ui.md` (Phase 0 신규 작성) — §2 규칙 (overlay 전용, 배경/border 유지), §4 불변 규칙 (사이렌 아이콘 = lucide `Siren`).
- `src/app/worker/_components/OfficeContactCard.tsx` — `urgent` 조건부 스타일이 **카드 전체에 박혀 있음**. 제거 대상:
  - line 183-188 (컨테이너 배경)
  - line 205-209 (긴급 뱃지 — 재설계)
  - line 215-224 (stage badge `urgent ? 'bg-white/20 text-white'`)
  - line 226-237 (inquiry_number/시간 `urgent ? 'text-white/70' : ...`)
  - line 239-253 (업체명/drawing_file_name/folder_path `urgent ? 'text-white' : ...`)
  - line 261-308 (Download/Upload/MessageSquare 버튼 color)
  - line 273 (Download spinner border)
  - line 352-353 (ChevronDown color)
  - line 358-403 (작업자 노트 background)
  - line 406-416 (분할 children wrapper border/color)
  - line 420-475 (각 child card 스타일)
  - line 502-519 (펼침 타임라인 wrapper border/color)
- `src/app/worker/_components/StaffContactCard.tsx` — 동일 패턴 (line 180, 196-200, 202-209, 210-216, 217-238, 247-292, 330-331, 337-358, 384-408, 473-496).
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — 긴급 overlay 신규 추가 위치.
- `src/__tests__/worker/OfficeContactCard.test.tsx`, `StaffContactCard.test.tsx` — 기존 urgent 관련 assertion 재조정.
- `lucide-react` 에 `Siren` 아이콘 export 확인 (`import { Siren } from 'lucide-react';`).

## 작업 내용

### 1. `OfficeContactCard` urgent 배경 제거 & 조건부 스타일 전부 원복

**파일**: `src/app/worker/_components/OfficeContactCard.tsx`

**원칙**: 파일 내 `urgent ? ... : ...` 삼항 분기를 **전부 제거**하고 "원래 일반 스타일만" 남긴다. `const urgent = !!contact.is_urgent;` (line 180) 변수 자체는 유지 (§2 긴급 뱃지 렌더 조건으로 사용).

주요 교체:

- **컨테이너 (line 183-188)**:

  ```tsx
  className={\`rounded-lg shadow-sm cursor-pointer transition-colors ${urgent ? 'bg-red-500 active:bg-red-600' : 'bg-white border border-gray-200 active:bg-gray-50'}\`}
  ```

  →

  ```tsx
  className =
    'rounded-lg shadow-sm cursor-pointer transition-colors bg-white border border-gray-200 active:bg-gray-50';
  ```

- **긴급 뱃지 (line 205-209)** — 재설계:

  ```tsx
  {
    urgent && (
      <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white">
        <Siren className="w-3 h-3 animate-pulse" />
        긴급
      </span>
    );
  }
  ```

- **stage badge (line 215-224)**: urgent 분기 제거, 기존 `stageInfo.bgColor stageInfo.color` 또는 `bg-gray-100 text-gray-500` 만 사용.
- **inquiry_number / formatCreatedAt**: `text-gray-400` 고정.
- **업체명**: `text-gray-900`. **drawing_file_name**: `text-gray-600`. **folder_path**: `text-gray-400`.
- **Download/Upload/MessageSquare 버튼**: 각 아이콘의 일반 hover 색상 (blue-600 / green-600 / #ED6C00) 만 사용.
- **Download spinner border**: `border-blue-600` 고정.
- **ChevronDown**: `text-gray-300`.
- **작업자 노트 (line 363-378, 385-400)**: urgent 분기 제거. 원래의 issue/memo 색상 (`bg-red-50 border-red-100 text-red-700` / `bg-yellow-50 border-yellow-100 text-yellow-800`) 만 사용.
- **분할 children wrapper (line 407-416)**: `border-gray-100`, `text-gray-500` 고정.
- **각 child card (line 420-475)**: stage_completed 일 때 `bg-green-50 border-green-200` (유지), 아니면 `bg-gray-50 border-gray-200` 고정. child 내부 텍스트/숫자 color 도 gray 계열 고정.
- **펼침 타임라인 wrapper (line 503-507)**: `border-gray-100`, `text-gray-500` 고정.

import 수정 (line 9): `import { Siren, Download, MessageSquare, ChevronDown, Upload } from 'lucide-react';`

### 2. `StaffContactCard` 동일 원복

**파일**: `src/app/worker/_components/StaffContactCard.tsx`

OfficeContactCard 와 동일 패턴으로 전부 원복. 긴급 뱃지도 Siren + bg-red-600 text-white 로 재설계. import 에 `Siren` 추가.

### 3. Admin `ContactCardHeader` 에 긴급 배지 overlay 추가

**파일**: `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx`

헤더의 업체명 또는 상태 뱃지 옆에 조건부 렌더 추가:

```tsx
{
  contact.is_urgent && (
    <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-600 text-white">
      <Siren className="w-3 h-3 animate-pulse" />
      긴급
    </span>
  );
}
```

import 추가: `import { Siren } from 'lucide-react';`

배치는 `contact-urgent-ui.md` §2 의 "header 영역 최우선 위치" 규칙을 따른다 — 업체명 바로 옆 또는 상태 뱃지 바로 뒤.

### 4. Worker 카드 테스트 재조정

**파일**: `src/__tests__/worker/OfficeContactCard.test.tsx`, `StaffContactCard.test.tsx`

기존 urgent 관련 assertion (카드 배경 `bg-red-500` 등) → 교체:

```tsx
it('does not apply bg-red-500 when urgent=true (uses overlay only)', () => {
  const urgentContact = { ...baseContact, is_urgent: true };
  const { container } = render(<OfficeContactCard contact={urgentContact} ... />);
  const root = container.firstChild as HTMLElement;
  expect(root.className).not.toContain('bg-red-500');
  expect(root.className).toContain('bg-white');
});

it('renders Siren icon and 긴급 badge when urgent=true', () => {
  const urgentContact = { ...baseContact, is_urgent: true };
  render(<OfficeContactCard contact={urgentContact} ... />);
  expect(screen.getByText('긴급')).toBeInTheDocument();
  // Siren 아이콘: lucide SVG 는 data-lucide 또는 role 로 검증
  // 폴백: 긴급 배지에 data-testid 추가 후 검증
});
```

기존 "urgent 카드 배경이 red" assertion 이 있으면 위 assertion 으로 교체. StaffContactCard 도 동일.

Admin `ContactCardHeader` 에 기존 테스트 파일 (`src/__tests__/components/ContactCardHeader.test.tsx`) 가 있으면 1건 추가.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="(Office|Staff)ContactCard|ContactCardHeader"
```

단일 메시지 병렬 발사. 통과 시 phase 5 status `"completed"`. 3회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- **urgent 조건부 스타일 전부 제거가 핵심**. 한 곳이라도 남기면 일관성 깨짐. 파일 내 `urgent` 등장 지점을 모두 점검.
- `const urgent = !!contact.is_urgent;` 변수 자체는 **유지** — 긴급 뱃지 렌더 조건으로 사용.
- Siren 아이콘은 `lucide-react` 에서 import. emoji (🚨 등) 사용 금지.
- Admin `ContactCard` 의 `CARD_STYLES.container` 건드리지 말 것 — `contact-urgent-ui.md` §4-1 (배경/border 유지).
- 긴급 뱃지는 **header 영역 1개**. 다른 위치 (푸터, 액션 영역) 중복 렌더 금지.
- 분할 children 카드 중 stage_completed 인 항목은 `bg-green-50 border-green-200` 유지 — 긴급과 무관.
- `BG_COLOR.success`, `TEXT_COLOR.success` 토큰 사용처 그대로.
- 테스트에서 lucide SVG 인식이 어려우면 긴급 배지에 `data-testid="urgent-badge"` 추가하여 fallback 검증.
- Phase 5 이후 Worker 카드의 긴급 시 시각은 "일반 카드 + 붉은 뱃지 + 사이렌" 으로 통일. E2E S7 에서 최종 검증.
