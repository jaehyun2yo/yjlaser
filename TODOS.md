# TODOS

## Socket.IO ERP 세션 정식 검증

- **What:** NestJS ContactsGateway에서 erp-session 토큰을 정식 복호화/검증
- **Why:** 현재는 쿠키 존재 확인만 하므로, 만료/위조 세션도 Socket.IO 연결 가능
- **Pros:** 보안 강화, 세션 만료 시 Socket 자동 disconnect
- **Cons:** SESSION_SECRET을 NestJS와 공유해야 함, 변경 범위 확대
- **Context:** contacts.gateway.ts L38-46에서 erp-session 쿠키 존재만 확인. Next.js API route(/api/erp/session)에서 세션 쿠키를 생성하며, iron-session 또는 자체 암호화 사용. NestJS에서 동일 시크릿으로 복호화 필요.
- **Depends on:** 세션 암호화 방식 확인 (iron-session vs custom)
- **Priority:** Low (내부망 + PIN 환경)
