# Admin Dashboard Notifications

## Status

Implemented 2026-05-15, pending deploy.

## Scope

관리자 알림을 웹하드, 통합관리, 작업관리로 분류하고 관리자 대시보드에서 바로 확인한다.

## Categories

| Category          | Source types                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `webhard`         | `file_uploaded`, `webhard_company_mismatch`, `webhard_classify_failed`                                                                                                                     |
| `integration`     | `company_approval_pending`, `company_created`, `company_status_updated`, `company_approved`, `booking_created`, `booking_updated`, `booking_cancelled`, `worker_created`, `worker_updated` |
| `work-management` | `new_contact`, `worker_note_added`, `worker_issue_added`, `worker_request_added`, `contact_urgent`                                                                                         |

## Event Sources

- Webhard upload completion creates `file_uploaded`.
- Booking create/update/delete creates `booking_created`, `booking_updated`, or `booking_cancelled`.
- Company registration creates `company_approval_pending` so approval-needed companies appear in the admin notification flow.
- Company status/approval flows create company notifications.
- Contact create creates `new_contact`.
- Worker memo/issue/request creates worker note notifications.
- Worker urgent toggle creates `contact_urgent` when urgent is enabled.

Notification creation is best-effort. A notification insert failure must log a warning and must not fail the authoritative upload, booking, company, or contact workflow.

## API Contract

- `GET /api/v1/notifications?category=webhard|integration|work-management`
- `GET /api/v1/notifications/unread-count?category=...`
- `GET /api/v1/notifications/unread-summary`
- Next.js session routes mirror these through `/api/notifications`, `/api/notifications/count`, and `/api/notifications/summary`.

Responses include `category` on each notification item.

## Dashboard UI

- `/admin` renders a compact dashboard: stats, recent notifications, today bookings, active sessions.
- The old quick links section is removed.
- The dashboard notification panel can switch between all/webhard/integration/work-management.
- The global admin notification center uses the same category tabs.
- Integration management no longer exposes the old dashboard, inventory, delivery, or workshop admin pages. `/admin/integration` and the main admin navigation open company management directly.
