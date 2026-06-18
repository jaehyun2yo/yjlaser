# Phase 4: worker-card-layout

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 §8 "후속 리팩토링" 섹션의 **"Worker 카드 layout 변경"** 항목. `formatCreatedAt` 을 `inquiry_number` 다음으로 이동하는 설계 이유(사용자가 "하단이 아닌 왼쪽 상태 오른쪽에 배치" 요청)를 확인.
- `tasks/16-classify-cta/docs-diff.md` — Phase 0 문서 diff.
- `tasks/16-classify-cta/phase1.md` / `phase3.md` 와 산출물 — Phase 1 의 `Contact.id: string` 정상화, Phase 3 의 CTA 분기 구조. 이 phase 는 layout 만 변경하므로 Phase 3 의 분기(`<InquiryClassifyButtons>` / `<OfficeAdvanceButton>`) 위치는 그대로 둔다.
- `src/app/(admin)/admin/contacts/_lib/utils.ts` — `formatCreatedAt(dateStr: string): string` 구현. `3/23 오전 9시 3분` 포맷. 재사용만 하고 수정하지 않는다.
- `src/app/worker/_components/OfficeContactCard.tsx` — 현재 생성시간이 세 번째 줄(`line 237-251`) 에 `webhard_folder_path` 옆으로 배치. 첫 번째 줄(`line 197-228`) 로 이동 대상.
- `src/app/worker/_components/StaffContactCard.tsx` — `OfficeContactCard` 와 동일 패턴(`line 227-240`). 두 파일 모두 동일한 layout 변경을 적용한다.
- `docs/specs/features/worker-portal.md` — Worker 카드 UX 베이스라인. 첫 줄/두 번째 줄 책임 분리 관점에서 layout 변경이 정합한지 확인.

## 작업 내용

### 1. `OfficeContactCard` 생성시간 위치 이동

**파일**: `src/app/worker/_components/OfficeContactCard.tsx`

**변경 전 (첫 번째 줄, `line 197-228` 근처)**:

```tsx
<div className="flex items-center gap-2 mb-0.5">
  {contact.status === 'received' && (<span className="...ping.../>)}
  {urgent && (<span>긴급</span>)}
  <InquiryTypeBadge contact={contact} mode="label-only" onStopPropagation={stopPropagation} />
  <span className={`shrink-0 ...${stageInfo.bgColor}...`}>{stageInfo.label}</span>
  {contact.inquiry_number && (
    <span className={`text-xs font-mono shrink-0 ${urgent ? 'text-white/70' : 'text-gray-400'}`}>
      {contact.inquiry_number}
    </span>
  )}
</div>
```

**변경 후** — `inquiry_number` 바로 뒤에 생성시간 추가:

```tsx
<div className="flex items-center gap-2 mb-0.5 flex-wrap">
  {contact.status === 'received' && (<span className="...ping.../>)}
  {urgent && (<span>긴급</span>)}
  <InquiryTypeBadge contact={contact} mode="label-only" onStopPropagation={stopPropagation} />
  <span className={`shrink-0 ...${stageInfo.bgColor}...`}>{stageInfo.label}</span>
  {contact.inquiry_number && (
    <span className={`text-xs font-mono shrink-0 ${urgent ? 'text-white/70' : 'text-gray-400'}`}>
      {contact.inquiry_number}
    </span>
  )}
  <span
    className={`text-[10px] flex-shrink-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}
  >
    {formatCreatedAt(contact.created_at)}
  </span>
</div>
```

**변경 전 (세 번째 줄, `line 237-251`)**:

```tsx
<div className="flex items-center gap-2 min-w-0">
  {contact.webhard_folder_path && (
    <p className={`text-[10px] truncate min-w-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
      {contact.webhard_folder_path}
    </p>
  )}
  <span className={`text-[10px] flex-shrink-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
    {formatCreatedAt(contact.created_at)}
  </span>
</div>
```

**변경 후** — `webhard_folder_path` 만 남김 (생성시간 제거):

```tsx
{
  contact.webhard_folder_path && (
    <p className={`text-[10px] truncate min-w-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
      {contact.webhard_folder_path}
    </p>
  );
}
```

wrapper `<div className="flex items-center gap-2 min-w-0">` 도 `webhard_folder_path` 가 없으면 빈 div 가 되지 않도록 조건부 렌더 또는 단독 `<p>` 로 단순화. `webhard_folder_path` 가 있을 때만 `<p>` 를 렌더하면 된다.

**`formatCreatedAt` import 는 유지** — 첫 줄에서 여전히 사용한다.

### 2. `StaffContactCard` 동일 변경

**파일**: `src/app/worker/_components/StaffContactCard.tsx`

**첫 번째 줄 (`line 195-217` 근처)**: `OfficeContactCard` 와 동일한 패턴으로 `inquiry_number`(또는 `work_number`) 다음에 생성시간 추가. 여기서는 `contact.work_number` 뒤에 배치:

```tsx
<div className="flex items-center gap-2 mb-0.5 flex-wrap">
  {urgent && <span>긴급</span>}
  {stageInfo && <span>{stageInfo.label}</span>}
  {contact.work_number && (
    <span className={`text-xs font-mono shrink-0 ${urgent ? 'text-white/70' : 'text-gray-400'}`}>
      {contact.work_number}
    </span>
  )}
  <span className={`text-[10px] flex-shrink-0 ${urgent ? 'text-white/60' : 'text-gray-400'}`}>
    {formatCreatedAt(contact.created_at)}
  </span>
</div>
```

**세 번째 줄 (`line 227-240`)**: `OfficeContactCard` 와 동일하게 `webhard_folder_path` 만 남기고 생성시간 제거.

### 3. 기존 테스트 회귀 확인

**대상**: `src/__tests__/worker/OfficeContactCard.test.tsx`, `StaffContactCard.test.tsx`

- 기존 `StaffContactCard` 의 `formatCreatedAt` 렌더 테스트 3건(Phase 4 of task 15 에서 추가됨)이 계속 통과해야 한다.
- 위치 변경은 테스트의 selector 에 영향을 줄 수 있다 — 만약 테스트가 **특정 부모 div 구조**를 assert 하고 있으면 selector 를 수정. **렌더 텍스트 자체**(`4/20 오전 8시 56분` 등)만 assert 하는 경우 수정 불필요.
- 우선 `pnpm test` 실행하여 실패 여부 확인 후, 실패한 케이스만 최소 수정.

### 4. (선택) 테스트 신규 추가

필수는 아니지만, layout 정합 회귀 방지를 위해 다음 1건을 추가하면 좋다:

**파일**: `src/__tests__/worker/OfficeContactCard.test.tsx` — 테스트 내용:

- `contact.inquiry_number = 'TEST-001'`, `created_at = '2026-04-20T08:56:00Z'` 로 렌더 시:
  - 첫 번째 줄 DOM 영역(헤더 내 mb-0.5 divider) 안에 `TEST-001` 과 `formatCreatedAt` 결과가 **같은 부모 flex container** 내에 존재하는지 assert.
  - 세 번째 줄(`webhard_folder_path` 라인) 안에는 `formatCreatedAt` 결과가 **없어야** 한다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test -- --testPathPattern="worker/(Office|Staff)ContactCard"
```

그리고 전체 회귀:

```bash
pnpm test
```

단일 메시지에 Bash 병렬로 발사. 모두 통과 시 `tasks/16-classify-cta/index.json` 의 phase 4 status 를 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

## 주의사항

- **`formatCreatedAt` 함수는 수정하지 마라** — `src/app/(admin)/admin/contacts/_lib/utils.ts` 의 공용 util. 위치만 이동시키고 포맷은 그대로.
- **첫 줄이 너무 빡빡해지면** `flex-wrap` 을 추가해 다음 줄로 내려가게 허용. 데스크톱에서는 한 줄에 들어가고 모바일에서 wrap 되는 자연스러운 반응.
- **`urgent` 긴급 카드 색상**: 생성시간은 긴급 카드일 때 `text-white/60`, 일반 카드일 때 `text-gray-400` 유지. 첫 줄로 이동해도 색상 토큰은 동일.
- **Admin `ContactCardHeader` 의 생성시간은 건드리지 마라** — 이미 오른쪽에 있고 사용자 요구는 Worker 대상이다. (불변: Admin 헤더 layout 변경 금지)
- **`StaffContactCard` 에 `inquiry_number` 대신 `work_number` 를 사용**한다 — 기존 코드 기준. Office 는 `inquiry_number`, Staff 는 `work_number`. 혼동 금지.
- **`formatCreatedAt` import 는 두 카드 모두 유지** — 첫 줄에서 여전히 사용.
- **기존 테스트를 깨뜨리지 마라**. 실패 케이스가 있으면 selector 를 최소 수정으로 맞추고, 새 assertion 추가는 선택.
- **디자인 토큰**: `text-[10px]` 유지 (작은 글씨 — 스펙 §3.1 Worker 생성시간 텍스트). `dark:` 금지.
