# Delivery Photo (납품완료 사진 촬영 최적화 + 조회)

## 개요

- 목적: Worker 납품완료 시 촬영하는 사진을 클라이언트 측에서 최적화(리사이즈/압축)하여 업로드하고, Worker/Admin/Company 포탈에서 납품완료 사진을 타임라인 및 상세/대시보드 화면에서 조회할 수 있게 한다.
- 도메인: Worker 납품 > 사진 촬영, Admin 작업관리 > 납품완료, Company 포탈 > 주문 상세/업체 대시보드
- 관련 스펙: `worker-delivery-management.md` (납품관리 — deliveryProofImage 필드 원본), `worker-delivery-optimization.md` (납품 즉시완료 플로우)

## 기존 스펙 관계

- `worker-delivery-management.md`에서 `deliveryProofImage` 필드와 R2 업로드를 정의 (구현 완료)
- `worker-delivery-optimization.md`에서 즉시완료 플로우를 정의 (구현 완료)
- 본 스펙은 위 두 스펙의 **확장** — 이미지 최적화 + 사진 조회 기능을 추가하며, 기존 구현을 대체하지 않음

## 요구사항

### 기능 요구사항

#### FR-1: 클라이언트 측 이미지 최적화

1. `DeliveryPhotoCapture.tsx`에서 사진 선택/촬영 후, R2 업로드 전에 브라우저에서 이미지를 리사이즈 및 압축
2. 최적화 파라미터:
   - 최대 해상도: 1920px (장변 기준, 비율 유지)
   - JPEG 품질: 0.7 (70%)
   - 출력 포맷: JPEG (PNG/HEIC 등 모두 JPEG로 변환)
   - 목표 파일 크기: 원본 대비 최소 60% 감소, 최대 500KB 이하
3. Canvas API를 사용하여 구현 (외부 라이브러리 불필요)
4. 최적화 중 로딩 인디케이터 표시
5. 최적화 실패 시 원본 파일로 fallback (업로드는 차단하지 않음)
6. `FILE_SIZE_LIMITS.REFERENCE_PHOTO` (10MB) 제한은 최적화 전 원본에 적용

#### FR-2: Worker/Admin 납품완료 타임라인에 사진 표시

1. `WorkerDeliveredItem.tsx`의 `buildTimeline()` 결과에서 납품완료 이벤트 하단에 증빙 사진 썸네일 표시
2. `DeliveredItem.tsx` (Admin)에서도 동일하게 납품완료 사진 표시
3. 사진 클릭 시 라이트박스(전체화면 모달)로 원본 크기 확인 가능
4. `contact.delivery_proof_image` 필드가 있을 때만 사진 섹션 렌더링

#### FR-3: Admin 상세 페이지에서 사진 표시

1. `/admin/work-management/[id]/page.tsx` 사이드바에서 납품 증빙 사진 표시
2. 타임라인 카드 아래에 별도 "납품 증빙 사진" 카드로 표시
3. `contactData.delivery_proof_image`가 존재할 때만 렌더링

#### FR-4: Company 포탈 주문 상세에서 사진 표시

1. `OrderDetailClient.tsx`에서 납품완료 상태일 때 증빙 사진 표시
2. NestJS integration/orders API에서 `deliveryProofImage` 필드를 응답에 포함
3. `OrderDetail` 타입에 `deliveryProofImage` 필드 추가
4. 보안 고려: R2 공개 URL만 전달 (내부 경로, 메모, 가격 등 노출 금지)

#### FR-5: 납품증빙 사진을 문의 폴더에 WebhardFile로 등록

1. Worker가 납품완료 사진을 업로드하면 Contact의 `deliveryProofImage` URL 저장과 별도로 해당 Contact의 inquiry 폴더에 `WebhardFile`을 생성한다.
2. 파일 표시명은 납품 완료 처리 시각(KST) 기준 `납품완료_YYYYMMDD_HHmmss.ext` 형식을 사용한다. 확장자는 업로드 파일명 또는 MIME 타입에서 결정한다.
3. 납품 완료 후 문의 폴더는 `문의/완료/{번호}` 하위에 위치해야 하며, 증빙 WebhardFile도 그 inquiry 폴더 id를 사용한다.
4. 업체 대시보드 문의 카드도 `delivery_proof_image`/`delivery_complete_image` 필드를 타입에 포함하고, 납품완료 상태에서 증빙 사진을 렌더링한다.

### 비기능 요구사항

- **성능**: 이미지 최적화 처리 시간 3초 이내 (일반적 모바일 카메라 사진 기준)
- **용량**: 최적화 후 업로드 파일 크기 500KB 이하 (원본 3-10MB 대비 90%+ 감소)
- **UX**: 최적화 중 프로그레스 표시, 모바일 터치 최적화
- **보안**: Company 포탈에 노출되는 데이터는 사진 URL과 타임라인 날짜만 (내부 정보 차단)

## 데이터 모델

### 관련 Prisma 모델

- **Contact**: `deliveryProofImage String? @map("delivery_proof_image")` — 이미 존재
- **ContactStatusHistory**: `note` 필드에 `'납품 사진 첨부'` 기록 — 이미 존재
- **WebhardFile**: 납품증빙 사진을 문의 폴더 파일로 등록 (`name=납품완료_YYYYMMDD_HHmmss.ext`, `folderId=inquiry folder`)

### 신규/변경

- DB 스키마 변경 **없음** — 기존 `deliveryProofImage` 필드를 그대로 사용
- NestJS integration/orders 응답에 `deliveryProofImage` 필드 추가 (API 레벨 변경만)

## API 설계

### 기존 API (확장)

| Method | Path                                  | 설명                                                  | Auth    |
| ------ | ------------------------------------- | ----------------------------------------------------- | ------- |
| POST   | /api/v1/contacts/batch-start-delivery | 납품완료 + 사진 URL 저장 + 문의 폴더 WebhardFile 등록 | API Key |

`batch-start-delivery`는 기존 `deliveryProofImage` 외에 다음 선택 필드를 받을 수 있다.

```json
{
  "deliveryProofOriginalName": "photo.webp",
  "deliveryProofFileSize": 123456,
  "deliveryProofMimeType": "image/webp"
}
```

### API 변경

| Method | Path                           | 변경 내용                             | Auth    |
| ------ | ------------------------------ | ------------------------------------- | ------- |
| GET    | /api/v1/integration/orders/:id | 응답에 `deliveryProofImage` 필드 추가 | Session |

### 변경 후 integration/orders/:id 응답 예시

```json
{
  "id": "...",
  "contactId": 123,
  "title": "...",
  "status": "delivered",
  "companyName": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "deliveredAt": "...",
  "deliveryProofImage": "https://r2-public-url.example.com/delivery-proofs/xxx.jpg",
  "events": [...]
}
```

### Server Action

`uploadDeliveryProofImage()`는 R2 공개 URL과 함께 `originalName`, `size`, `mimeType` 메타데이터를 반환한다. `batchStartDelivery()`는 이 메타데이터를 NestJS `batch-start-delivery` API로 전달한다.

## 완료 기준

1. [ ] 사진 촬영/선택 후 Canvas API로 리사이즈(max 1920px) + JPEG 압축(q=0.7) 적용
2. [ ] 최적화 후 파일 크기가 원본 대비 60% 이상 감소
3. [ ] 최적화 중 로딩 인디케이터 표시
4. [ ] 최적화 실패 시 원본 파일로 fallback (에러 시 업로드 차단하지 않음)
5. [ ] Worker `WorkerDeliveredItem` 타임라인에서 납품 사진 썸네일 표시
6. [ ] Admin `DeliveredItem` 타임라인에서 납품 사진 썸네일 표시
7. [ ] 사진 클릭 시 라이트박스로 전체화면 조회
8. [ ] Admin `/admin/work-management/[id]` 사이드바에 납품 증빙 사진 카드 표시
9. [ ] NestJS integration/orders/:id API가 `deliveryProofImage` 필드 반환
10. [ ] Company `OrderDetailClient`에서 납품완료 사진 표시 (deliveredAt 존재 시)
11. [ ] Company 포탈에 내부 정보(가격, 메모 등) 미노출
12. [ ] `@/lib/styles.ts` 스타일 상수 사용
13. [ ] `queryKeys` 팩토리 사용
14. [ ] 납품증빙 WebhardFile이 문의 폴더에 `납품완료_YYYYMMDD_HHmmss.ext` 이름으로 생성됨
15. [ ] 업체 대시보드 납품 완료 카드에서 납품증빙 사진 표시
16. [ ] `logger` 사용 (console.log 금지)
17. [ ] tsc --noEmit 통과
18. [ ] pnpm lint 통과
