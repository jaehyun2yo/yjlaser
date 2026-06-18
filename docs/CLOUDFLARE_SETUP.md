# Cloudflare 설정 가이드

> yjlaser.net 도메인의 DNS, 이메일, CDN 설정 가이드

## 목차

1. [DNS 설정 및 Vercel 연결](#1-dns-설정-및-vercel-연결)
2. [Email Routing 설정](#2-email-routing-설정)
3. [문제 해결](#3-문제-해결)

---

## 1. DNS 설정 및 Vercel 연결

### 현재 DNS 레코드 구성

현재 `yjlaser.net` 도메인의 DNS 레코드 상태:

| 레코드           | 용도                                     |
| ---------------- | ---------------------------------------- |
| `www` CNAME      | Vercel 배포 연결                         |
| `yjlaser.net` R2 | Cloudflare R2 파일 스토리지 연결         |
| MX 레코드        | 이메일 라우팅 (Cloudflare Email Routing) |
| TXT 레코드       | SPF, DKIM 등 이메일 인증                 |

---

### A 레코드 / CNAME 충돌 해결

**에러 메시지:**

```
A CNAME record with that host already exists.
```

**원인:** DNS 규칙상 같은 hostname에 A 레코드와 CNAME 레코드를 동시에 설정할 수 없습니다. `www`에 CNAME 레코드가 존재하면 같은 이름으로 A 레코드를 추가할 수 없습니다.

**방법 1: CNAME 레코드 삭제 후 A 레코드 추가**

루트 도메인(`yjlaser.net`)을 Vercel에 직접 연결하려는 경우에 사용합니다.

1. Cloudflare 대시보드 → DNS → Records로 이동
2. `www` CNAME 레코드에서 Edit → Delete 클릭
3. A 레코드 추가:
   ```
   Type: A
   Name: @ (또는 yjlaser.net)
   IPv4 address: [Vercel에서 제공하는 IP 주소]
   Proxy status: Proxied
   TTL: Auto
   ```
4. `www` 서브도메인용 A 레코드 추가 (선택사항):
   ```
   Type: A
   Name: www
   IPv4 address: [루트 도메인과 동일한 IP]
   Proxy status: Proxied
   TTL: Auto
   ```

Vercel IP 주소는 Vercel 프로젝트 → Settings → Domains에서 확인하거나 `vercel domains inspect yjlaser.net` 명령으로 확인할 수 있습니다.

**방법 2: CNAME Flattening 사용**

`www` CNAME을 유지하면서 루트 도메인도 연결하려는 경우에 사용합니다. Cloudflare는 무료 플랜에서도 CNAME Flattening을 지원합니다.

- `www` CNAME 레코드는 그대로 유지
- 루트 도메인은 Cloudflare가 자동으로 CNAME을 A 레코드처럼 처리

**방법 3: Vercel 권장 방법 (CNAME 사용)**

Vercel에서 공식적으로 권장하는 방법입니다.

1. 기존 `www` CNAME이 Vercel을 가리키는지 확인
2. 루트 도메인용 CNAME 추가:
   ```
   Type: CNAME
   Name: @
   Target: cname.vercel-dns.com (Vercel에서 제공하는 값)
   Proxy status: Proxied
   TTL: Auto
   ```

---

### Vercel 배포를 위한 권장 설정

**옵션 A: 루트 도메인 + www 모두 연결 (권장)**

```
Type: CNAME
Name: @
Target: [Vercel CNAME 값]
Proxy: Proxied
```

`www` CNAME은 이미 설정되어 있으므로 루트 도메인 CNAME만 추가하면 됩니다.

**옵션 B: www만 사용, 루트는 리다이렉트**

1. `www` CNAME 유지
2. Vercel이 자동으로 `yjlaser.net` → `www.yjlaser.net` 리다이렉트 처리

**단계별 설정 순서:**

1. Vercel 프로젝트 → Settings → Domains → "Add Domain" 클릭
2. `yjlaser.net` 입력 후 Vercel이 안내하는 DNS 값 확인
3. Cloudflare DNS에서 해당 값으로 레코드 추가
4. DNS 전파 대기 (보통 몇 분, 최대 24시간)
5. `yjlaser.net` 및 `www.yjlaser.net` 접속 테스트

---

### 주의사항

**R2 레코드와의 충돌**

현재 `yjlaser.net`에 R2 스토리지 레코드가 설정되어 있습니다. 웹사이트용 레코드와 충돌할 수 있으므로, R2는 서브도메인(예: `files.yjlaser.net`)을 사용하는 것을 권장합니다.

**R2 환경 분리**

개발과 프로덕션 R2 버킷이 분리되어 있습니다:

- 프로덕션: `yjlaser` 버킷 (CDN: `cdn.yjlaser.net`)
- 개발: `yjlaser-dev` 버킷 (CDN 없음, R2 직접 URL 사용)

`.env.local`의 `R2_BUCKET_NAME` 값으로 환경을 구분합니다. 개발 버킷에는 별도 API 토큰을 사용하거나, 기존 토큰에 `yjlaser-dev` 버킷 권한을 추가하세요.

**R2 CORS 설정**

웹하드 파일 업로드는 브라우저에서 R2 Presigned URL로 직접 PUT 요청을 보내는 구조이므로 (cross-origin), R2 버킷에 CORS 설정이 필수입니다. CORS가 미설정되면 브라우저가 preflight 요청을 차단하여 업로드가 실패합니다.

CORS 설정 스크립트 실행:

```bash
npx tsx scripts/setup-r2-cors.ts
```

스크립트가 적용하는 CORS 규칙:

| 항목            | 값                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Allowed Origins | `http://localhost:3000`, `https://yjlaser.com`, `https://www.yjlaser.com`, `https://yjlaser.net`, `https://www.yjlaser.net` |
| Allowed Methods | `GET`, `PUT`, `HEAD`, `DELETE`                                                                                              |
| Allowed Headers | `*` (전체 허용)                                                                                                             |
| Expose Headers  | `ETag` (멀티파트 업로드에 필요)                                                                                             |
| MaxAge          | 3600초                                                                                                                      |

> **주의**: dev (`yjlaser-dev`) 버킷과 prod (`yjlaser`) 버킷 모두에 CORS를 설정해야 합니다. 스크립트는 `.env.local`의 `R2_BUCKET_NAME`에 해당하는 버킷에 적용되므로, 환경 변수를 전환하여 양쪽 모두 실행하세요.

**이메일 레코드 유지**

MX 레코드와 TXT 레코드는 절대 삭제하지 마십시오. 이메일 라우팅과 SPF, DKIM 인증에 필수적입니다.

**Proxy 상태 설정**

| 상태     | 아이콘      | 설명                           | 권장 대상          |
| -------- | ----------- | ------------------------------ | ------------------ |
| Proxied  | 주황색 구름 | Cloudflare CDN 경유, DDoS 보호 | 웹사이트 레코드    |
| DNS only | 회색 구름   | DNS만, CDN 없음                | 이메일 관련 레코드 |

---

## 2. Email Routing 설정

### 개요

Cloudflare Email Routing을 사용하여 `service@yjlaser.net`으로 수신되는 모든 이메일을 `yjlaserbusiness@gmail.com`으로 자동 전달합니다. 이 서비스는 무료이며 설정 후 몇 분 내에 동작합니다.

---

### 설정 방법

**1단계: Cloudflare 대시보드 접속**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)에 로그인
2. `yjlaser.net` 도메인 선택

**2단계: Email Routing 활성화**

1. 좌측 메뉴에서 Email → Email Routing 선택
2. "Get started" 또는 "Enable Email Routing" 클릭

**3단계: 받는 주소 설정 (Destination Address)**

1. Destination addresses 탭에서 "Create address" 클릭
2. `yjlaserbusiness@gmail.com` 입력
3. Gmail에서 발송된 확인 이메일의 링크를 클릭하여 인증 완료

**4단계: 발신 주소 설정 (Custom Address)**

1. Routing rules 탭에서 "Create address" 클릭
2. "Custom address" 선택
3. 다음과 같이 입력:
   - Address: `service`
   - Send to: `yjlaserbusiness@gmail.com`
4. Save 클릭

**5단계: DNS 레코드 확인**

Cloudflare가 자동으로 다음 MX 레코드를 추가합니다:

```
Type: MX
Name: @ (또는 yjlaser.net)
Priority: 10
Target: route1.mx.cloudflare.net

Type: MX
Name: @ (또는 yjlaser.net)
Priority: 50
Target: route2.mx.cloudflare.net
```

**6단계: 동작 확인**

테스트 이메일을 `service@yjlaser.net`으로 발송하여 `yjlaserbusiness@gmail.com`으로 정상 전달되는지 확인합니다.

---

### 환경 변수 설정

`.env.local` 파일에 다음 SMTP 설정을 추가합니다:

```env
# SMTP 설정 (이메일 발송용)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yjlaserbusiness@gmail.com
SMTP_PASSWORD=your-gmail-app-password

# 이메일 주소 설정
FROM_NAME=웹사이트 문의                  # 보낸 사람 이름
ADMIN_EMAIL=yjlaserbusiness@gmail.com   # 관리자 수신 이메일
REPLY_TO_EMAIL=service@yjlaser.net      # 답장 주소 (회사 공식 이메일)
```

---

### 이메일 처리 방식

웹사이트 문의 폼에서 이메일 전송 시 처리 흐름:

1. **보낸 사람 (`from`)**: `SMTP_USER` (Gmail 계정)
   - SMTP 인증 계정과 동일하게 설정하여 Gmail의 중복 제거 방지
2. **받는 사람 (`to`)**: `ADMIN_EMAIL` (`yjlaserbusiness@gmail.com`)
   - 관리자가 실제로 수신하는 주소
3. **답장 주소 (`replyTo`)**: `service@yjlaser.net` + 문의자 이메일
   - 관리자가 답장 시 회사 공식 이메일 또는 문의자 이메일 중 선택 가능

**전체 흐름:**

```
문의 폼 제출
    ↓
코드에서 이메일 발송 (SMTP → Gmail)
    ↓
관리자(yjlaserbusiness@gmail.com) 수신
    ↓
관리자 답장 선택:
  ├── service@yjlaser.net → Cloudflare Email Routing 경유
  └── 문의자 이메일 → 문의자에게 직접 전달
```

Cloudflare Email Routing은 외부 클라이언트가 `service@yjlaser.net`으로 보낼 때만 포워딩됩니다. SMTP를 직접 사용하는 경우에는 `from`을 SMTP 인증 계정과 동일하게 설정해야 합니다.

---

### Gmail 중복 제거 문제 해결

Gmail은 SMTP 인증 계정과 받는 사람이 같은 경우, `from` 필드가 달라도 자가 메일로 인식하여 중복 제거할 수 있습니다.

**해결 방법**: `from` 필드를 SMTP 인증 계정(`SMTP_USER`)과 동일하게 설정합니다.

```env
# 권장 설정
ADMIN_EMAIL=yjlaserbusiness@gmail.com   # 직접 수신 주소 사용

# 피해야 할 설정
# ADMIN_EMAIL=service@yjlaser.net       # Gmail 중복 제거 발생 가능
```

이 설정으로 다음 효과를 얻을 수 있습니다:

- Gmail이 이메일을 정상적으로 수신
- 이메일 중복 제거 방지
- `replyTo` 필드를 통해 회사 공식 이메일로 답장 가능

**Cloudflare Email Routing 경고 해결:**

다음과 같은 경고가 표시될 수 있습니다:

> "Are you missing an email sent from yjlaserbusiness@gmail.com to service@yjlaser.net?"

이 경고는 Cloudflare 대시보드에서 테스트 이메일을 `yjlaserbusiness@gmail.com`에서 `service@yjlaser.net`으로 보낼 때 발생합니다. 같은 계정에서 보낸 이메일을 Gmail이 중복 제거하는 것이 원인입니다.

해결 방법:

- 다른 이메일 주소(예: 별도 Gmail 계정)에서 테스트 이메일 발송
- 현재 코드 설정이 올바르다면 실제 문의 폼에서는 문제가 없으므로 무시 가능

**참고사항:**

- Cloudflare Email Routing은 무료 서비스
- 설정 후 몇 분 내 적용
- SPF/DKIM은 Cloudflare가 자동 관리
- 일일 전송 제한: 1,000개 (무료 플랜 기준)

---

## 3. 문제 해결

### DNS 관련

**DNS 전파 확인**

```bash
# DNS 전파 상태 확인
nslookup yjlaser.net
dig yjlaser.net

# CNAME 레코드 확인
nslookup -type=CNAME www.yjlaser.net
```

**Cloudflare 캐시 초기화**

Cloudflare 대시보드 → Caching → Purge Everything 클릭

**레코드 충돌 확인**

- DNS → Records에서 같은 이름에 여러 레코드가 있는지 확인
- 중복 레코드 삭제 후 재시도

**Vercel 로그 확인**

Vercel 대시보드 → Deployments → Logs에서 DNS 관련 에러 메시지 확인

---

### 이메일 관련

**이메일이 전달되지 않는 경우**

1. DNS 레코드 확인: MX 레코드가 `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`을 가리키는지 확인
2. Destination address 인증 여부 확인: Cloudflare 대시보드에서 `yjlaserbusiness@gmail.com`이 인증(Verified) 상태인지 확인
3. Gmail 스팸 폴더 확인: 전달된 이메일이 스팸으로 분류되었을 수 있음
4. Cloudflare 라우팅 로그 확인: Email → Email Routing → Activity log에서 이메일 처리 내역 확인

**스팸 폴더로 분류되는 경우**

- Cloudflare가 자동 관리하는 SPF/DKIM 레코드가 올바르게 설정되어 있는지 확인
- TXT 레코드(SPF)가 삭제되지 않았는지 확인

**Cloudflare Email Routing 로그 확인**

Cloudflare 대시보드 → Email → Email Routing → Activity log에서 전달 성공/실패 내역을 확인할 수 있습니다.

---

## 체크리스트

### DNS / Vercel 연결

- [ ] Vercel에서 도메인(`yjlaser.net`, `www.yjlaser.net`) 추가 완료
- [ ] Vercel에서 제공하는 CNAME 또는 IP 값 확인
- [ ] Cloudflare에서 기존 충돌 레코드 확인 및 정리
- [ ] 루트 도메인 CNAME 또는 A 레코드 추가
- [ ] Proxy 상태 Proxied로 설정
- [ ] DNS 전파 대기 (수 분 ~ 최대 24시간)
- [ ] `yjlaser.net` 및 `www.yjlaser.net` 접속 테스트
- [ ] MX 레코드 및 TXT 레코드(SPF, DKIM) 유지 확인

### Email Routing

- [ ] Cloudflare Email Routing 활성화
- [ ] `yjlaserbusiness@gmail.com` Destination address 인증 완료
- [ ] `service@yjlaser.net` Routing rule 설정
- [ ] MX 레코드 자동 생성 확인
- [ ] `.env.local` 환경 변수 설정 완료
- [ ] 테스트 이메일 전달 확인

---

**최종 업데이트**: 2026-02-19
