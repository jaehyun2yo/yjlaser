# Delivery Management V2 (납품 관리 2단계 개선)

## 개요

- 목적: Worker 납품 관리 페이지를 개선한다. (1) 테스트 데이터 삭제, (2) 납품 플로우를 2단계(시작/완료)로 분리, (3) 탭 기반 통합 UI 구현
- 도메인: Worker 모바일 앱 > 납품 관리
- 관련 스펙:
  - `worker-delivery-management.md` — 납품 관리 페이지 원본 스펙 (구현 완료)
  - `worker-delivery-optimization.md` — 즉시 완료 플로우 (본 스펙에서 대체)
  - `delivery-photo.md` — 사진 최적화/조회 (유지, 확장)

## 기존 스펙 충돌 분석

`worker-delivery-optimization.md` FR-4에서는 "납품완료 클릭 시 즉시 status='delivered' + processStage=null"로 한 단계 완료를 정의했으나, 본 스펙에서는 **2단계(시작 -> 완료)**로 분리한다. 본 스펙이 최신 요구사항이므로 이전 스펙의 FR-4를 대체(supersede)한다.

`delivery-photo.md`의 이미지 최적화 로직은 유지하되, 사진 저장 시점이 2곳으로 분리된다:

- 납품 시작 시: `deliveryProofImage` (출발 사진) — 기존 필드 재사용
- 납품 완료 시: `deliveryCompleteImage` (도착/완료 사진) — 신규 필드

## 요구사항

### 요구사항 1: 삼신도무송 테스트 데이터 삭제

1. 문의번호 `260401-F-001` (삼신도무송) 건을 DB에서 삭제
2. 기존 `DELETE /api/v1/contacts/:id` 엔드포인트 활용 (permanent=true)
3. 관련 ContactStatusHistory 레코드도 cascade로 삭제됨

### 요구사항 2: 납품 2단계 분리

#### FR-2-1: 납품 시작 (delivering)

1. Worker가 납품 대기 건을 선택 -> "납품 시작" 클릭
2. 선택된 건들의 `status`를 `'delivering'`으로 변경
3. `processStage`는 `'delivery'`로 유지 (아직 완료 아님)
4. 사진이 있으면 `deliveryProofImage`에 저장 (출발 사진)
5. 사진이 없으면 사진 없이 진행

#### FR-2-2: 납품 완료 (delivered)

1. Worker가 "납품 중" 탭에서 건을 선택 -> "납품 완료" 클릭
2. 선택된 건들의 `status`를 `'delivered'`로, `processStage`를 `null`로 변경
3. 사진이 있으면 `deliveryCompleteImage`에 저장 (도착/완료 사진)
4. 사진이 없으면 사진 없이 진행

#### FR-2-3: DB 변경

1. Contact 모델에 `deliveryCompleteImage String? @map("delivery_complete_image")` 필드 추가
2. Contact status에 `'delivering'` 값 허용 (String 필드이므로 enum 변경 불필요)

#### FR-2-4: API 변경

1. `POST /api/v1/contacts/batch-start-delivery` 수정:
   - 기존: status='delivered', processStage=null (즉시 완료)
   - 변경: status='delivering', processStage='delivery' 유지
   - deliveryProofImage 저장 로직 유지

2. `POST /api/v1/contacts/batch-complete-delivery` 신규:
   - status='delivered', processStage=null
   - deliveryCompleteImage 저장
   - ContactStatusHistory 2건 생성 (status_change + process_stage_change)
   - Socket.IO contacts:batch_updated 이벤트

### 요구사항 3: 탭 기반 통합 UI

#### FR-3-1: 탭 구조

1. `/worker/delivery` 하나의 페이지에 3개 탭:
   - **대기** 탭: `processStage='delivery'` AND `status != 'delivering'` AND `status != 'delivered'`
   - **납품 중** 탭: `processStage='delivery'` AND `status='delivering'`
   - **완료** 탭: `status='delivered'` (기존 `/worker/delivered`의 내용)

2. 각 탭에 건수 배지 표시

#### FR-3-2: 대기 탭 동작

1. 기존 납품 대기 목록과 동일한 카드 UI
2. 카드 선택 -> 하단 "납품 시작" 버튼 -> 사진 촬영 모달 -> batchStartDelivery API
3. 납품 시작 완료 후 해당 건이 "납품 중" 탭으로 이동

#### FR-3-3: 납품 중 탭 동작

1. status='delivering'인 건 목록 표시
2. 카드 선택 -> 하단 "납품 완료" 버튼 -> 사진 촬영 모달 -> batchCompleteDelivery API
3. 납품 완료 후 해당 건이 "완료" 탭으로 이동

#### FR-3-4: 완료 탭 동작

1. 기존 `/worker/delivered` 페이지의 내용을 탭으로 통합
2. 일별/월별 필터, 업체 필터, 검색 기능 유지
3. 타임라인 + 납품 사진 표시 유지

#### FR-3-5: 기존 경로 처리

1. `/worker/delivered` 접근 시 `/worker/delivery?tab=completed`로 리다이렉트

### 비기능 요구사항

- **성능**: 탭 전환 시 각 탭 데이터를 별도 쿼리로 조회 (탭 전환 지연 최소화)
- **보안**: Worker PIN 인증 필수 (기존 미들웨어 활용)
- **UX**: 모바일 전용, 터치 친화적, 44px+ 터치 타겟
- **호환성**: integration/orders 시스템의 'delivering' 상태와 호환 유지

## 데이터 모델

### 관련 Prisma 모델

- **Contact**: `processStage`, `status`, `deliveryProofImage`, `companyName`, `inquiryNumber` 등
- **ContactStatusHistory**: `changeType`, `fromStatus`, `toStatus`, `fromStage`, `toStage`

### 신규/변경

1. **Contact 모델 필드 추가**:

   ```prisma
   deliveryCompleteImage  String?  @map("delivery_complete_image")
   ```

   - 위치: Contact 모델 배송 정보 섹션, `deliveryProofImage` 다음

2. **Contact status 값 추가**: `'delivering'` (Prisma String 필드이므로 별도 enum 변경 없음)

3. **Prisma 마이그레이션 필요**: `delivery_complete_image` 컬럼 추가

## API 설계

### 기존 API 변경

| Method | Path                                  | 변경 내용                                                 | Auth    |
| ------ | ------------------------------------- | --------------------------------------------------------- | ------- |
| POST   | /api/v1/contacts/batch-start-delivery | status='delivering' (기존 'delivered'), processStage 유지 | API Key |

#### 변경 후 batch-start-delivery 로직

**Before (현재):**

1. status='delivered', processStage=null (즉시 완료)
2. ContactStatusHistory: status_change(->delivered) + process_stage_change(delivery->null)

**After (변경):**

1. status='delivering', processStage='delivery' 유지
2. ContactStatusHistory: status_change(->delivering)
3. deliveryProofImage 저장 (있을 경우)

**Request** (변경 없음):

```json
{
  "contactIds": ["uuid-1", "uuid-2"],
  "deliveryProofImage": "https://r2.example.com/...",
  "actorType": "worker",
  "actorName": "김작업자"
}
```

### 신규 API

| Method | Path                                     | 설명                                  | Auth    |
| ------ | ---------------------------------------- | ------------------------------------- | ------- |
| POST   | /api/v1/contacts/batch-complete-delivery | 일괄 납품완료 (delivering->delivered) | API Key |

#### POST /api/v1/contacts/batch-complete-delivery

**Request**:

```json
{
  "contactIds": ["uuid-1", "uuid-2"],
  "deliveryCompleteImage": "https://r2.example.com/...",
  "actorType": "worker",
  "actorName": "김작업자"
}
```

**Response** (200):

```json
{
  "results": [
    { "contactId": "uuid-1", "success": true },
    { "contactId": "uuid-2", "success": false, "error": "Already delivered" }
  ]
}
```

**로직**:

1. contactIds로 일괄 조회 (1회 DB)
2. 유효성 검증: `processStage='delivery'` AND `status='delivering'`
3. Prisma.$transaction:
   - status='delivered', processStage=null, deliveryCompleteImage 설정
   - ContactStatusHistory: status_change(delivering->delivered) + process_stage_change(delivery->null)
4. Socket.IO contacts:batch_updated 이벤트

### Next.js Server Action

기존 `batchStartDelivery()` 유지 + 신규 `batchCompleteDelivery()` 추가:

```typescript
export async function batchCompleteDelivery(
  contactIds: string[],
  deliveryCompleteImage?: string
): Promise<{ success: boolean; results?: BatchResult[]; error?: string }>;
```

### NestJS Server Client

신규 함수 추가:

```typescript
export async function serverBatchCompleteDelivery(
  contactIds: string[],
  deliveryCompleteImage?: string,
  actor?: { actorType: string; actorName: string }
): Promise<{ success: boolean; results?: BatchResult[]; error?: string }>;
```

## 완료 기준

1. [ ] 삼신도무송(260401-F-001) 건이 DB에서 삭제됨
2. [ ] Contact 모델에 `deliveryCompleteImage` 필드 추가 + 마이그레이션 완료
3. [ ] `POST /api/v1/contacts/batch-start-delivery`가 status='delivering'으로 변경 (즉시 완료 아님)
4. [ ] `POST /api/v1/contacts/batch-complete-delivery` 신규 엔드포인트 구현
5. [ ] batchCompleteDelivery가 status='delivered', processStage=null로 설정
6. [ ] deliveryCompleteImage가 납품 완료 시 저장됨
7. [ ] `/worker/delivery` 페이지에 3개 탭 (대기/납품중/완료) 표시
8. [ ] 대기 탭에서 "납품 시작" -> status='delivering'으로 전환
9. [ ] 납품 중 탭에서 "납품 완료" -> status='delivered'로 전환
10. [ ] 완료 탭에서 기존 delivered 목록 + 필터/검색 동작
11. [ ] `/worker/delivered` 접근 시 `/worker/delivery?tab=completed`로 리다이렉트
12. [ ] Socket.IO 실시간 업데이트 동작 (탭간 이동 반영)
13. [ ] integration/orders 시스템의 delivering 상태와 호환 유지
14. [ ] tsc --noEmit 통과
15. [ ] pnpm lint 통과
