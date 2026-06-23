# 2026-06-22 API Key 보안 로그 보강

## 배경

YJLaser 공통 로깅 시스템 구축 Task 7의 회사사이트 slice로 NestJS 통합 API
인증 거부 경로에 보안 로그를 추가했다.

## 변경 내용

- `webhard-api/src/common/logging/log-event.ts`에 NestJS backend용 공통 로그 이벤트 helper를 추가했다.
- `ApiKeyGuard`의 invalid API key, integration permission denied, missing credentials 경로에서 `security` 채널 로그를 남긴다.
- `CsrfGuard`의 CSRF token 누락과 mismatch 경로에서 `security` 채널 로그를 남긴다.
- upload presigned URL 발급 로그에서 raw filename을 제거하고 extension, size, provider 중심으로 기록한다.
- `confirmUpload` 성공/라우팅/AutoContact queue 로그에서 raw filename, storage key, drive file id를 제거하고 extension, size, folderId, companyId, provider 중심으로 기록한다.
- AutoContact 단건/배치 dispatch 로그에서 raw filename, folderPath, companyName, fileUrl을 제거한다.
- `AutoContactService` 내부 detect/classify/duplicate/update/create/error/prefix 로그에서 raw filename, fileUrl, folderPath, companyName을 제거한다.
- 중앙 로그 수집 API/Auth shell을 표준 `LogEvent v1` 계약으로 정렬하고, HMAC header 인증, client/project allowlist, nonce replay, 100건 batch 제한, 256 KiB body 제한, raw sensitive payload 거부, 환경변수 기반 client key store를 검증한다.
- 중앙 로그 수집 controller/service/request pipe의 start/success/failure/conflict/payload rejection 로그를 `LogEvent v1` JSON으로 통일하고, raw client id/key id/signature/payload 값 대신 hash/count/reason code만 기록한다.
- 중앙 로그 수집 DTO의 처리시간 필드를 표준 `duration_ms`로 맞추고, 공통 식별자 hash를 unsalted SHA-256이 아닌 HMAC-SHA256 기반으로 보강했다.
- 계정 복구 rate limit의 Upstash 설정 누락/HTTP 실패/command error/request 실패 로그를 `LogEvent v1` JSON으로 통일하고, raw Redis URL/token/secret/companyId/fingerprint/Error 원문 대신 operation/count/reason/error type만 기록한다.
- `IntegrationGateway` 연결/인증/거부/room join/leave 로그를 `LogEvent v1` JSON으로 통일하고, raw cookie/API key/socket room 원문 대신 socket/room hash와 room type만 기록한다.
- `NotificationsGateway`, `BookingsGateway`, `ActivityLogsGateway`, `FeedbackGateway` 연결/거부/room join/disconnect 로그를 공통 WebSocket gateway `LogEvent v1` helper로 통일하고, raw cookie/socket room/client id 대신 socket/room hash와 room type만 기록한다.
- `EventsGateway`, `ContactsGateway` 연결/인증/거부/subscribe/emit failure 로그를 공통 WebSocket gateway `LogEvent v1` 규칙으로 통일하고, raw cookie/socket token/client id/folder room/error message 대신 hash, room type, reason code만 기록한다.
- `MailService`와 `AccountRecoveryMailDispatcher` 메일 설정/skip/send failure/계정복구 발송 실패 로그를 `LogEvent v1` JSON으로 통일하고, raw recipient email/subject/reset token/SMTP error/fingerprint 대신 subject/company/fingerprint hash, reason code, attempt count만 기록한다.
- `BackupService` 백업 설정/파일 백업 실패/백업 완료/디렉토리 탐색 실패/예약 백업 로그를 `LogEvent v1` JSON으로 통일하고, raw NAS path/file name/storage key/Drive id/error message 대신 file/company/path hash, reason code, count, error type만 기록한다.
- `FeedbackService` 피드백 메일 알림 실패 로그를 `LogEvent v1` JSON으로 통일하고, raw companyName/companyEmail/content/category/SMTP error 대신 company/feedback/category hash, reason code, contact presence만 기록한다.
- `ActivityLogsService` activity log 생성 실패 로그를 `LogEvent v1` JSON으로 통일하고, raw actor/action/resource/details/IP/User-Agent/Error 대신 actor/action/resource hash, presence flag, reason code, error type만 기록한다.
- `SettingsService` 설정 조회/수정 실패 로그를 `LogEvent v1` JSON으로 통일하고, raw userId/download path/Error 대신 user hash, user type, changed field presence, reason code, error type만 기록한다.
- raw `X-API-Key` 값은 로그에 남기지 않고 16자리 SHA-256 hash만 `actor_id_hash`로 기록한다.
- raw CSRF cookie/header token 값은 로그에 남기지 않는다.
- raw upload URL과 고객 파일명은 presigned URL 발급/업로드 확정/AutoContact 로그에 남기지 않는다.
- 인증 성공 경로는 노이즈를 줄이기 위해 이번 slice에서 로그를 추가하지 않았다.

## 검증

```powershell
cd webhard-api
pnpm test -- api-key.guard.spec.ts request-redaction.spec.ts --runInBand
pnpm test -- csrf.guard.spec.ts api-key.guard.spec.ts request-redaction.spec.ts --runInBand
pnpm test -- src/files/__tests__/files.service.spec.ts --runInBand
pnpm test -- src/integration/log-events --runInBand
pnpm test -- src/auth/account-recovery-rate-limit.service.spec.ts src/auth/password-reset.service.spec.ts src/auth/find-id.service.spec.ts src/common/logging/request-redaction.spec.ts --runInBand
pnpm test -- src/integration/gateway/integration.gateway.spec.ts --runInBand
pnpm test -- src/notifications/notifications.gateway.spec.ts src/bookings/bookings.gateway.spec.ts src/activity-logs/activity-logs.gateway.spec.ts src/feedback/feedback.gateway.spec.ts --runInBand
pnpm test -- src/events/__tests__/events.gateway.spec.ts src/contacts/contacts.gateway.spec.ts --runInBand
pnpm test -- src/mail/mail.service.spec.ts src/auth/account-recovery-mail.dispatcher.spec.ts --runInBand
pnpm test -- src/backup/backup.service.spec.ts --runInBand
pnpm test -- src/feedback/__tests__/feedback.service.spec.ts --runInBand
pnpm test -- src/activity-logs/activity-logs.service.spec.ts --runInBand
pnpm test -- src/settings/settings.service.spec.ts --runInBand
pnpm test -- src/common/logging/log-event.spec.ts src/integration/log-events/log-event-request.pipe.spec.ts --runInBand
npx tsc --noEmit --pretty false
```

## 민감정보 기준

로그 payload에는 제출된 API key, session cookie, authorization header, password,
token 값을 직접 포함하지 않는다. 실패 사유는 `metadata.reason` 코드로 기록한다.
