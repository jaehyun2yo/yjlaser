/**
 * DEPRECATED: This controller is no longer active.
 *
 * Contact creation responsibility has been moved to AutoContactService,
 * which is triggered automatically after file upload (confirmUpload / batchConfirmUpload).
 *
 * The external sync program (외부웹하드동기화프로그램) should NOT call this endpoint.
 * It should only transfer files via the file upload API, and contact creation
 * will happen automatically based on folder path classification.
 *
 * Removed from OrdersModule controllers list.
 */

// This file is intentionally left empty. The WebhardSyncController has been removed.
// See: webhard-api/src/integration/orders/auto-contact.service.ts
