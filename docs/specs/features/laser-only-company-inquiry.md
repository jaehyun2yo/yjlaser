# laser-only-company-inquiry (레이저가공 전용 업체 문의 유형)

## 개요

- 목적: 레이저가공 서비스만 이용하는 업체에 대해 간소화된 워크플로우를 제공한다. 목형 제작 공정(칼/오시)이 필요 없는 업체의 문의는 `레이저가공 -> 작업완료`로 끝나며, 기존 업체의 워크플로우에는 영향을 주지 않는다.
- 도메인: 업체 관리, 문의(Contact) 자동 생성, 작업 보드
- 관련: 칼선/목형 `inquiry_type`의 카드 UX(1-click 분류 + 재분류 컨텍스트 메뉴)는 [inquiry-classification-ux.md](./inquiry-classification-ux.md) 참조.

## 요구사항

### 기능 요구사항

1. **업체 유형 구분**: 관리자가 업체를 "레이저가공 전용"으로 설정/해제할 수 있다.
2. **새로운 최종 상태 `completed`**: 레이저가공 전용 업체의 문의가 완료되면 `delivered`가 아닌 `completed`(작업완료) 상태로 종결된다.
3. **자동 문의 생성 시 레이저 전용 분기**:
   - laserOnly 업체의 웹하드 파일 -> 기본적으로 `status=cutting`, `processStage=laser`, `inquiryType='laser_cutting'`으로 문의 생성
   - laserOnly 업체라도 "샘플의뢰" 폴더의 파일 -> 기존 샘플 로직 우선 (`status=confirmed`, `processStage=sample`)
4. **상태 전환 규칙**:
   - laserOnly 문의: `cutting -> completed` (기존: `cutting -> finishing -> delivered`)
   - laserOnly 샘플 문의: `confirmed -> completed` (기존: `confirmed -> production -> ...`)
   - `completed`는 최종 상태로 추가 전환 불가 (`completed -> []`)
   - 기존 문의의 상태 전환은 영향 없음
5. **관리자 UI**:
   - 업체 상세 페이지에 "레이저가공 전용" 토글 표시
   - 작업 보드에서 `completed`(작업완료) 상태 카드 표시
6. **프론트엔드 라벨/필터**:
   - STATUS_LABELS에 `completed: '작업완료'` 추가
   - 보드 필터에 '작업완료' 옵션 추가
7. **업체 연결 시 기존 문의 동기화**: 관리자가 레이저가공 업체 관리에서 미연결 매핑에 업체를 연결(`linkCompany`)하면, 해당 폴더명(`folderName`)으로 저장된 기존 Contact들의 `companyName`을 연결된 Company의 `companyName`으로 일괄 업데이트한다. 단, `folderName === Company.companyName`이면 스킵한다. 업데이트된 Contact에는 ContactStatusHistory에 `changeType='company_linked'` 이력을 기록한다. 50건 단위 batch 처리. 응답 DTO에 `updated_contact_count` 필드로 업데이트된 Contact 수를 반환한다.

### 비기능 요구사항

- 성능: Company 조회 시 laserOnly 필드 추가 — 기존 인덱스로 충분 (boolean 필드)
- 하위호환: 기존 문의의 워크플로우에 영향 없음. completed 상태는 laserOnly 업체 전용이 아니며, 향후 다른 용도로도 활용 가능
- 보안: laserOnly 토글은 관리자만 변경 가능 (기존 ApiKeyGuard 적용)

## 공정 흐름

### 일반 문의 (7단계)

```
접수(received) → 도면작업(drawing) → 샘플제작(sample) → 도면확정(drawing_confirmed)
  → 레이저가공(laser) → 칼작업(cutting) → 오시작업(creasing) → 납품(delivery)
```

### 레이저 전용 문의 (3단계)

```
접수(status=cutting, processStage=laser) → 레이저가공 → 완료(status=completed, processStage=null)
```

- 자동 문의 생성 시 `status='cutting', processStage='laser', inquiryType='laser_cutting'`으로 시작
- 레이저가공 완료 시 `status='completed', processStage=null`로 즉시 종료
- 칼작업(cutting), 오시작업(creasing), 납품(delivery) 단계를 거치지 않음
- `completed`는 최종 상태로 추가 전환 불가 (`completed -> []`)

### 업체 대시보드 (OrderProgressBar)

- `inquiry_type='laser_cutting'` 문의는 3단계만 표시: **접수 → 레이저가공 → 완료**
- 일반 문의는 기존 7단계 프로그레스바 그대로 표시

### 관리자 공정보드

- 레이저 전용 문의(`inquiryType='laser_cutting'`)의 다음 단계로 cutting/creasing/delivery 대신 **"완료(completed)"** 옵션만 제공
- 기존 문의의 공정보드 동작에는 영향 없음

### 작업자 앱

- 레이저 전용 문의에 **"레이저가공 완료"** 버튼 표시
- 버튼 클릭 시 `status='completed', processStage=null`로 전환

## 데이터 모델

### 관련 Prisma 모델

- `Company` (schema.prisma line 11-51)
- `Contact` (schema.prisma line 441+)
- `ContactStatusHistory` (schema.prisma line 574+)

### 신규/변경

**Company 테이블 변경:**

```prisma
model Company {
  // ... 기존 필드 ...

  // === 업체 유형 ===
  laserOnly   Boolean   @default(false) @map("laser_only")
}
```

**ContactStatus enum 변경 (order.dto.ts):**

```typescript
export enum ContactStatus {
  // ... 기존 ...
  COMPLETED = 'completed', // 신규: 작업완료 (레이저 전용 업체 최종 상태)
}
```

**VALID_STATUS_TRANSITIONS 변경:**

```typescript
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  // ... 기존 ...
  cutting: ['finishing', 'delivered', 'completed', 'on_hold'], // completed 추가
  confirmed: ['production', 'drawing', 'completed', 'on_hold'], // completed 추가
  completed: [], // 최종 상태, 추가 전환 불가
  on_hold: ['received', 'drawing', 'confirmed', 'production', 'cutting', 'finishing', 'completed'],
};
```

**InquiryType 확장 (auto-contact.service.ts):**

```typescript
export type InquiryType = 'cutting_request' | 'mold_request' | 'laser_cutting';
```

**LaserOnlyMapping table (new):**

```prisma
model LaserOnlyMapping {
  id          Int       @id @default(autoincrement())
  folderName  String    @unique @map("folder_name")  // webhard folder name = company name
  companyId   Int?      @map("company_id")            // linked company (nullable)
  company     Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  isActive    Boolean   @default(true) @map("is_active")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @default(now()) @map("updated_at")

  @@index([folderName])
  @@index([companyId])
  @@map("laser_only_mappings")
}
```

## Design Change: LaserOnlyMapping Introduction

### Previous Approach

- Only companies with `Company.laserOnly=true` were treated as laser_cutting
- Unregistered companies could not be classified as laser-only

### New Approach

- **LaserOnlyMapping** table is the primary source for laser-only classification
- `Company.laserOnly` is the secondary source for backward compatibility
- Unregistered companies can be mapped by folder name (= company name)
- When a company registers later, admin manually links it (no auto-linking)
- Linking a company to a mapping auto-syncs `Company.laserOnly = true`
- Deleting a mapping auto-syncs `Company.laserOnly = false`

## API 설계

| Method | Path                             | 설명                                  | Auth        |
| ------ | -------------------------------- | ------------------------------------- | ----------- |
| PATCH  | /api/v1/companies/:id            | 업체 정보 수정 (laserOnly 포함)       | ApiKeyGuard |
| PATCH  | /api/v1/companies/:id/laser-only | 레이저 전용 토글 (전용 엔드포인트)    | ApiKeyGuard |
| GET    | /api/v1/companies/:id            | 업체 상세 조회 (laser_only 필드 포함) | ApiKeyGuard |

### PATCH /api/v1/companies/:id/laser-only

**Request:**

```json
{ "laserOnly": true }
```

**Response:**

```json
{
  "company": { "id": 1, "laser_only": true, "...": "..." },
  "previousLaserOnly": false
}
```

## 변경 대상 파일 요약

### 백엔드 (NestJS)

| 파일                                                         | 변경 내용                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `webhard-api/prisma/schema.prisma`                           | Company 모델에 `laserOnly` 필드 추가                                                             |
| `webhard-api/src/integration/orders/dto/order.dto.ts`        | ContactStatus enum에 COMPLETED 추가, VALID_STATUS_TRANSITIONS 수정                               |
| `webhard-api/src/integration/orders/auto-contact.service.ts` | InquiryType에 laser_cutting 추가, createNewContact에 laserOnly 분기                              |
| `webhard-api/src/companies/dto/company.dto.ts`               | UpdateCompanyProfileDto에 laserOnly 필드 추가, UpdateLaserOnlyDto 신규                           |
| `webhard-api/src/companies/companies.controller.ts`          | PATCH /:id/laser-only 엔드포인트 추가                                                            |
| `webhard-api/src/companies/companies.service.ts`             | toggleLaserOnly 메서드 추가, toSnakeCase에 laser_only 포함                                       |
| `webhard-api/src/folders/webhard-config.service.ts`          | PROCESS_STAGE_TO_STATUS에 laser -> completed 경로 없음 (기존 유지, 분기는 auto-contact에서 처리) |
| `webhard-api/src/contacts/contacts.service.ts`               | updateProcessStage에서 laserOnly 문의의 상태 전환 분기                                           |

### 프론트엔드 (Next.js)

| 파일                                                            | 변경 내용                                          |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `src/lib/utils/statusLabels.ts`                                 | STATUS_LABELS에 completed 추가                     |
| `src/app/(admin)/admin/companies/[id]/page.tsx`                 | Company 인터페이스에 laser_only 추가, UI 토글 표시 |
| `src/app/(admin)/admin/work-management/board/_lib/constants.ts` | 보드 필터에 작업완료 상태 추가                     |

## 완료 기준

1. [x] Company 테이블에 `laser_only` 컬럼 추가 (Prisma migration)
2. [x] `PATCH /api/v1/companies/:id/laser-only` 엔드포인트 동작
3. [x] 관리자 업체 상세 페이지에서 "레이저가공 전용" 토글 정상 동작
4. [x] laserOnly 업체의 웹하드 파일 업로드 시 `status=cutting, processStage=laser, inquiryType=laser_cutting`으로 문의 자동 생성
5. [x] laserOnly 업체의 샘플의뢰 폴더 파일은 기존 샘플 로직 유지 (`status=confirmed, processStage=sample`)
6. [x] `completed` 상태가 STATUS_LABELS, VALID_STATUS_TRANSITIONS에 정상 등록
7. [x] laserOnly 문의의 `cutting -> completed` 상태 전환 정상 동작
8. [x] 작업 보드에서 `completed` 상태 카드가 표시됨
9. [x] 기존 업체(laserOnly=false)의 워크플로우에 영향 없음
10. [x] 자동 문의 생성 테스트 통과
