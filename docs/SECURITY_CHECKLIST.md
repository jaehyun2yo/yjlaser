# 보안 체크리스트 - 동접 20~30명 규모

## 📋 개요

동시 접속자 20~30명 규모에서 고려해야 할 보안 사항들을 정리한 문서입니다.

---

## 🔴 긴급 (즉시 적용 필요)

### 1. Rate Limiting 강화

**현재 상태**: 메모리 기반 Map 사용 (단일 서버에서만 작동)
**문제점**:

- 서버 재시작 시 데이터 손실
- 멀티 서버 환경에서 동작하지 않음
- 메모리 누수 가능성

**해결 방안**:

```typescript
// Redis 기반 Rate Limiting으로 전환 필요
// 예: @upstash/ratelimit 또는 ioredis 사용
```

**권장 사항**:

- ✅ API 엔드포인트별 Rate Limiting 적용
  - 로그인: 5회/15분
  - 일반 API: 100회/분
  - 파일 업로드: 10회/시간
- ✅ IP 기반 + 사용자 ID 기반 이중 제한
- ✅ Redis 또는 Upstash Redis 사용

---

### 2. 세션 보안 강화

**현재 상태**:

- ✅ httpOnly 쿠키 사용
- ✅ secure 플래그 (프로덕션)
- ⚠️ 세션 만료 시간 24시간 (너무 김)
- ⚠️ 세션 고정 공격 방지 미흡

**개선 사항**:

- ✅ 세션 만료 시간 단축: 24시간 → 8시간
- ✅ 자동 갱신: 활동 시 세션 연장 (최대 24시간)
- ✅ 세션 고정 방지: 로그인 시 세션 ID 재생성
- ✅ 동시 세션 제한: 사용자당 최대 3개 세션
- ✅ 의심스러운 활동 감지 시 세션 무효화

---

### 3. CSRF 보호

**현재 상태**: ⚠️ CSRF 토큰 미구현
**위험도**: 높음 (POST/PUT/DELETE 요청)

**해결 방안**:

```typescript
// Next.js의 built-in CSRF 보호 활성화
// 또는 @edge-runtime/csrf 사용
```

**권장 사항**:

- ✅ 모든 상태 변경 요청에 CSRF 토큰 검증
- ✅ SameSite 쿠키 정책 강화 (lax → strict)
- ✅ Double Submit Cookie 패턴 구현

---

### 4. 입력 검증 및 Sanitization

**현재 상태**:

- ✅ 기본적인 입력 검증 존재
- ⚠️ XSS 방지 sanitization 미흡
- ⚠️ SQL Injection 방지 (Supabase 사용으로 어느 정도 보호됨)

**개선 사항**:

- ✅ DOMPurify 또는 sanitize-html 라이브러리 도입
- ✅ 모든 사용자 입력에 대해 HTML 이스케이프
- ✅ 파일 업로드 시 파일 타입 검증 강화
- ✅ 파일명 sanitization (경로 탐색 공격 방지)

---

## 🟡 중요 (1주일 내 적용 권장)

### 5. API 보안 헤더 강화

**현재 상태**: ✅ 기본 보안 헤더 설정됨
**개선 사항**:

- ✅ Content-Security-Policy (CSP) 헤더 추가
- ✅ X-Content-Type-Options: nosniff (이미 설정됨)
- ✅ X-Frame-Options: DENY (현재 SAMEORIGIN)
- ✅ HSTS 헤더 (이미 설정됨)

**CSP 예시**:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';
```

---

### 6. 로깅 및 모니터링

**현재 상태**: ⚠️ 기본 로깅만 존재
**필요 사항**:

- ✅ 보안 이벤트 로깅
  - 실패한 로그인 시도
  - 권한 없는 접근 시도
  - 의심스러운 API 호출
- ✅ 로그 집계 및 분석 도구 (예: Sentry, LogRocket)
- ✅ 이상 행위 감지 알림

---

### 7. 비밀번호 정책 강화

**현재 상태**: ⚠️ 비밀번호 정책 미확인
**권장 사항**:

- ✅ 최소 8자 이상
- ✅ 소문자, 숫자, 특수문자 조합
- ✅ 일반적인 비밀번호 차단 (예: "password123")
- ✅ 비밀번호 변경 시 이전 비밀번호 재사용 방지
- ✅ 비밀번호 만료 정책 (선택사항)

---

### 8. 파일 업로드 보안

**현재 상태**:

- ✅ 파일 크기 제한 존재
- ⚠️ 파일 타입 검증 강화 필요
- ⚠️ 악성 파일 스캔 미구현

**개선 사항**:

- ✅ 허용된 MIME 타입 화이트리스트
- ✅ 파일 확장자 검증
- ✅ 파일 내용 검증 (매직 넘버)
- ✅ 업로드된 파일 격리 저장
- ✅ 바이러스 스캔 (선택사항)

---

### 9. 데이터베이스 보안

**현재 상태**: Supabase 사용 (관리형 서비스)
**확인 사항**:

- ✅ Row Level Security (RLS) 정책 확인
- ✅ 데이터베이스 연결 암호화
- ✅ 백업 암호화
- ✅ 접근 로그 모니터링

---

## 🟢 권장 (1개월 내 적용)

### 10. 인증 보안 강화

**개선 사항**:

- ✅ 2FA (Two-Factor Authentication) 도입
- ✅ 로그인 시도 실패 시 CAPTCHA
- ✅ 계정 잠금 정책 (5회 실패 시 15분 잠금)
- ✅ 비정상적인 로그인 위치 감지

---

### 11. API 인증 강화

**현재 상태**: 세션 기반 인증
**개선 사항**:

- ✅ API 키 기반 인증 (외부 API용)
- ✅ JWT 토큰 만료 시간 단축
- ✅ 토큰 갱신 메커니즘
- ✅ 토큰 블랙리스트 관리

---

### 12. 에러 처리 보안

**현재 상태**: ⚠️ 에러 메시지에 민감 정보 노출 가능성
**개선 사항**:

- ✅ 프로덕션에서 상세 에러 메시지 숨김
- ✅ 에러 로깅은 상세하게, 사용자에게는 일반 메시지
- ✅ 스택 트레이스 노출 방지

---

### 13. 의존성 보안

**필요 사항**:

- ✅ 정기적인 `npm audit` 실행
- ✅ Dependabot 또는 Snyk 사용
- ✅ 취약점 패치 자동화
- ✅ 의존성 버전 고정

---

### 14. 환경 변수 보안

**현재 상태**: ✅ 환경 변수 검증 로직 존재
**확인 사항**:

- ✅ .env 파일이 Git에 커밋되지 않았는지 확인
- ✅ 프로덕션 환경 변수 암호화
- ✅ 시크릿 관리 도구 사용 (예: AWS Secrets Manager, Vercel Environment Variables)

---

### 15. HTTPS 강제

**현재 상태**: ✅ HSTS 헤더 설정됨
**확인 사항**:

- ✅ 모든 HTTP 요청을 HTTPS로 리다이렉트
- ✅ SSL/TLS 인증서 자동 갱신
- ✅ TLS 1.2 이상 사용

---

## 📊 모니터링 및 대응

### 16. 보안 모니터링

**필요 도구**:

- ✅ 실시간 트래픽 모니터링
- ✅ 이상 패턴 감지
- ✅ DDoS 공격 감지 및 대응
- ✅ 보안 이벤트 대시보드

---

### 17. 인시던트 대응 계획

**준비 사항**:

- ✅ 보안 침해 시 대응 절차 문서화
- ✅ 연락처 목록 (보안팀, 호스팅 제공자 등)
- ✅ 백업 및 복구 절차
- ✅ 정기적인 보안 감사

---

## 🔧 구현 우선순위

### Phase 1 (즉시)

1. Rate Limiting Redis 전환
2. CSRF 보호 구현
3. 입력 Sanitization 강화
4. 세션 보안 강화

### Phase 2 (1주일 내)

5. 보안 헤더 강화
6. 로깅 및 모니터링
7. 파일 업로드 보안
8. 비밀번호 정책

### Phase 3 (1개월 내)

9. 2FA 도입
10. API 인증 강화
11. 의존성 보안 자동화
12. 보안 모니터링 구축

---

## 📚 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security Best Practices](https://nextjs.org/docs/app/building-your-application/configuring/security-headers)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)

---

## ✅ 체크리스트

### 인증 및 인가

- [ ] Rate Limiting (Redis 기반)
- [ ] CSRF 보호
- [ ] 세션 보안 강화
- [ ] 2FA (선택사항)
- [ ] 비밀번호 정책

### 입력 검증

- [ ] XSS 방지 (Sanitization)
- [ ] SQL Injection 방지 (Supabase RLS)
- [ ] 파일 업로드 보안
- [ ] 입력 길이 제한

### 네트워크 보안

- [ ] HTTPS 강제
- [ ] 보안 헤더 (CSP 포함)
- [ ] CORS 정책
- [ ] DDoS 방어

### 모니터링

- [ ] 보안 이벤트 로깅
- [ ] 이상 행위 감지
- [ ] 에러 모니터링
- [ ] 성능 모니터링

### 인프라

- [ ] 환경 변수 보안
- [ ] 의존성 보안
- [ ] 백업 및 복구
- [ ] 인시던트 대응 계획

---

**마지막 업데이트**: 2025-01-27
**다음 검토 예정일**: 2025-02-27
