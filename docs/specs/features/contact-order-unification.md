# Contact/Order Unification Design Document

## Current State Analysis

### Dual Structure

- **Contact** (문의): Admin work management (`/admin/contacts`), webhard auto-creation, multi-stage status
- **Order** (주문): Company portal (`/company/orders`), DXF management program integration, multi-stage status
- Same concept (inquiry = order) duplicated across two tables

### Problems

- Dual data management, synchronization code (`updateOrderStatus` → `contact.update`)
- Type mismatch: `Order.contactId` (BigInt) vs `Contact.id` (UUID) — FK constraint impossible
- Connected via `inquiryNumber` string matching (fragile)
- Duplicate status systems across Order and Contact

### Fields Unique to Contact

| Field                                                                           | Purpose                                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| name, email, phone, position                                                    | Customer info (from website form)                                                                   |
| subject, message                                                                | Inquiry content                                                                                     |
| contactType, source                                                             | Origin tracking                                                                                     |
| inquiryType, inquiryNumber, workNumber                                          | Classification & numbering (UX: see [inquiry-classification-ux.md](./inquiry-classification-ux.md)) |
| processStage                                                                    | Simplified process tracking                                                                         |
| drawingFileUrl, drawingFileName, drawingType                                    | Drawing attachments                                                                                 |
| referencePhotosUrls, drawingModification, drawingNotes                          | Drawing details                                                                                     |
| boxShape, length, width, height, material                                       | Product specs                                                                                       |
| hasPhysicalSample, hasReferencePhotos, sampleNotes                              | Sample info                                                                                         |
| deliveryMethod, deliveryAddress, deliveryName, deliveryPhone                    | Delivery info                                                                                       |
| deliveryType, deliveryCompanyName, deliveryCompanyPhone, deliveryCompanyAddress | Delivery company info                                                                               |
| deliveryNote, deliveryMethodChangedAt, receiptMethod                            | Delivery tracking                                                                                   |
| deliveryProofImage, deliveryCompleteImage                                       | Delivery evidence                                                                                   |
| revisionRequest\* (6 fields)                                                    | Revision requests                                                                                   |
| portfolioReference\* (11 fields)                                                | Portfolio reference                                                                                 |
| workerMemo, workerIssue, workerMemoAt, workerMemoBy                             | Worker notes (deprecated)                                                                           |
| isUrgent, urgentAt                                                              | Urgency flags                                                                                       |
| parentContactId, splitIndex, splitCount, stageCompleted                         | Split support                                                                                       |
| ContactStatusHistory (relation)                                                 | Status change history                                                                               |
| WorkerNote, DrawingRevision (relations)                                         | Worker notes & drawing revisions                                                                    |

### Fields Unique to Order

| Field                   | Purpose                  |
| ----------------------- | ------------------------ |
| dxfClassifiedCount      | DXF classification count |
| dxfTotalPrice           | DXF total price          |
| nestingSheetCount       | Nesting sheet count      |
| nestingUtilization      | Nesting utilization rate |
| scheduledAutoCompleteAt | Auto-complete schedule   |
| OrderEvent (relation)   | Event log                |
| Task (relation)         | Machine assignment       |
| Delivery (relation)     | Delivery tracking        |

> **Note:** Contact already has `dxfClassifiedCount`, `dxfTotalPrice`, `nestingSheetCount`, `nestingUtilization`, and `scheduledAutoCompleteAt` fields (added in earlier migration). Phase B is partially complete at the schema level.

## Unification Strategy

### Principles

- Contact becomes the single source of truth
- Order table is phased out gradually
- DXF-specific fields are added to Contact but hidden from company portal
- External programs maintain backward compatibility through API wrappers

### Phased Execution Plan

#### Phase A: API Wrapper (Backward Compatibility)

- Keep existing `POST /api/v1/integration/orders` endpoint
- Internally write to Contact (stop Order creation)
- DXF management program works without API changes
- Map Order status values to Contact status values at the API layer

#### Phase B: Contact Schema Extension

- Add DXF fields to Contact: `dxfClassifiedCount`, `dxfTotalPrice`, `nestingSheetCount`, `nestingUtilization`
- Contact already has these fields — verify they are populated correctly
- Merge `OrderEvent` into `ContactStatusHistory`
- Change Task and Delivery FK to reference Contact

#### Phase C: Company Portal Migration

- Rewrite `/company/orders` page to Contact-based queries
- Migrate existing Order data to Contact
- Verify data integrity post-migration

#### Phase D: Order Deprecation

- Mark Order table as deprecated
- Delete Order table after verification period
- Delete OrderEvent table

### Impact Scope

#### Backend

- `OrdersService`: Refactor to write to Contact instead of Order
- Integration API: Wrapper layer mapping Order endpoints → Contact operations
- DXF management program (Python): No API changes needed (wrapper handles it)

#### Frontend

- Company orders page (`/company/orders`): Rewrite to use Contact API
- Admin work management: Already Contact-based, minimal changes
- Worker UI: Already Contact-based, no changes

#### External Programs

- `yjlaser_api_client` (Python): Transparent via API wrapper
- `유진레이저목형 관리프로그램` (Python): Transparent via API wrapper
- `외부웹하드동기화프로그램` (TypeScript): Already uses Contact auto-creation

### Risks

| Risk                                 | Mitigation                                               |
| ------------------------------------ | -------------------------------------------------------- |
| Data integrity during migration      | Run migration in transaction, verify counts before/after |
| DXF management program compatibility | API wrapper preserves exact request/response shape       |
| Company portal usability changes     | Phase C includes UX review before deployment             |
| Incomplete data migration            | Dual-write period during Phase A to catch edge cases     |
| Order-specific queries in reports    | Update admin dashboard queries during Phase B            |

### Timeline Dependencies

| Phase | Dependency       | Description                         |
| ----- | ---------------- | ----------------------------------- |
| A     | None             | API wrapper — can start immediately |
| B     | Phase A stable   | Schema extension + FK migration     |
| C     | Phase B stable   | Frontend rewrite                    |
| D     | Phase C verified | Cleanup                             |
