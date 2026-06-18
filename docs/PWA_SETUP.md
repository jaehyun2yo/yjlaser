# PWA 오프라인 지원 및 푸시 알림 설정 가이드

## 1. 개요

YJLaser ERP의 PWA(Progressive Web App) 기능은 다음을 제공합니다:

- ✅ **오프라인 지원**: 인터넷 없이도 앱 사용 가능 (캐시 활용)
- ✅ **오프라인 큐잉**: 오프라인 상태에서의 작업을 온라인 복귀 시 자동 동기화
- ✅ **푸시 알림**: 작업 배정, 상태 변경 등 실시간 알림
- ✅ **설치 가능**: 홈 화면에 추가하여 네이티브 앱처럼 사용

## 2. web-push 패키지 설치

푸시 알림을 사용하려면 `web-push` 패키지가 필요합니다.

```bash
pnpm add web-push
pnpm add -D @types/web-push
```

## 3. VAPID 키 생성

VAPID(Voluntary Application Server Identification) 키는 푸시 알림 서버 인증에 사용됩니다.

### 3.1. VAPID 키 생성 스크립트 실행

```bash
npx web-push generate-vapid-keys
```

출력 예시:

```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib27SRuu123...

Private Key:
bdSiGcguMILHPmXKqsfim2OiZO123...

=======================================
```

### 3.2. 환경 변수 설정

생성된 키를 `.env.local` 파일에 추가합니다:

```env
# VAPID Keys for Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa-Ib27SRuu123...
VAPID_PRIVATE_KEY=bdSiGcguMILHPmXKqsfim2OiZO123...
VAPID_SUBJECT=mailto:yjlaserbusiness@gmail.com
```

**⚠️ 주의:**

- `NEXT_PUBLIC_` 접두사가 붙은 환경 변수만 클라이언트에서 접근 가능합니다.
- `VAPID_PRIVATE_KEY`는 절대로 클라이언트에 노출되면 안 됩니다!
- `.env.local`은 `.gitignore`에 포함되어 있어 Git에 커밋되지 않습니다.

## 4. Supabase 마이그레이션 실행

푸시 구독 정보를 저장할 테이블을 생성합니다.

### 4.1. Supabase CLI로 마이그레이션 실행

```bash
# Supabase 프로젝트 링크 (최초 1회)
npx supabase link --project-ref <your-project-ref>

# 마이그레이션 실행
npx supabase db push
```

### 4.2. 또는 Supabase Dashboard에서 직접 실행

1. Supabase Dashboard → SQL Editor 이동
2. `supabase/migrations/20260213_create_push_subscriptions.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기 후 실행

## 5. API 라우트 활성화

### 5.1. `/src/app/api/push/send/route.ts` 수정

파일을 열고 `web-push` 관련 주석을 해제합니다:

```typescript
// 주석 해제
import webpush from 'web-push';

// 주석 해제
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

// 주석 해제 및 임시 코드 제거
return webpush.sendNotification(pushSubscription, payload);
```

### 5.2. 에러 처리 활성화

만료된 구독 정보 정리 코드도 주석 해제합니다:

```typescript
if (error.statusCode === 404 || error.statusCode === 410) {
  await supabase.from('push_subscriptions').delete().eq('endpoint', subscriptions[i].endpoint);
}
```

## 6. Service Worker 등록 확인

### 6.1. 프로덕션 빌드에서만 활성화

Service Worker는 `production` 환경에서만 등록됩니다:

```typescript
// src/app/erp/_components/ServiceWorkerRegistration.tsx
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  // ...
}
```

### 6.2. 개발 환경에서 테스트

개발 환경에서 테스트하려면:

```bash
pnpm build
pnpm start
```

## 7. 사용 방법

### 7.1. 푸시 알림 발송 예시

```typescript
// 작업 배정 시 푸시 알림 발송
const response = await fetch('/api/push/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workerId: '123',
    title: '새로운 작업이 배정되었습니다',
    body: 'CNC 가공 - 주문번호 #1234',
    url: '/erp/tasks/5678',
    data: { taskId: '5678', orderId: '1234' },
  }),
});

const result = await response.json();
console.log(`알림 전송: ${result.sent}개 성공, ${result.failed}개 실패`);
```

### 7.2. 오프라인 상태 확인

```typescript
// 온라인/오프라인 상태는 자동으로 감지되어 toast 메시지로 표시됩니다.
// ServiceWorkerRegistration 컴포넌트가 자동으로 처리합니다.

// 커스텀 처리가 필요한 경우:
window.addEventListener('online', () => {
  console.log('온라인 상태로 전환');
});

window.addEventListener('offline', () => {
  console.log('오프라인 상태로 전환');
});
```

### 7.3. 오프라인 큐 수동 동기화

```typescript
// 필요 시 수동으로 오프라인 큐 동기화
if (navigator.serviceWorker.controller) {
  navigator.serviceWorker.controller.postMessage({
    type: 'SYNC_OFFLINE_QUEUE',
  });
}
```

## 8. 캐시 전략

### 8.1. App Shell (HTML, CSS, JS)

- **전략**: Cache First
- **설명**: 정적 자산은 캐시를 우선 사용하고, 없으면 네트워크에서 가져옴
- **대상**: `/erp`, `/erp/login`, `/erp/tasks`, manifest 등

### 8.2. API 응답 (`/api/erp/*`)

- **전략**: Network First
- **설명**: 네트워크를 우선 사용하고, 실패 시 캐시된 응답 반환
- **대상**: `/api/erp/tasks`, `/api/erp/orders` 등

### 8.3. POST/PUT/DELETE 요청

- **전략**: 오프라인 큐잉
- **설명**: 오프라인 상태에서는 IndexedDB에 저장 후 온라인 복귀 시 자동 동기화
- **대상**: 작업 상태 변경, 시간 기록 등

## 9. 브라우저 지원

### 9.1. Service Worker 지원

- ✅ Chrome/Edge 40+
- ✅ Firefox 44+
- ✅ Safari 11.1+
- ✅ Opera 27+

### 9.2. Push API 지원

- ✅ Chrome/Edge 50+
- ✅ Firefox 44+
- ✅ Safari 16+ (iOS 16.4+)
- ❌ Safari < 16 (데스크톱/모바일 모두 미지원)

## 10. 트러블슈팅

### 10.1. Service Worker가 등록되지 않음

**증상**: 콘솔에 Service Worker 로그가 없음

**해결**:

1. 프로덕션 빌드인지 확인 (`pnpm build && pnpm start`)
2. HTTPS 환경인지 확인 (localhost는 HTTP도 허용)
3. 브라우저 DevTools → Application → Service Workers 확인

### 10.2. 푸시 알림이 표시되지 않음

**증상**: 푸시 전송은 성공하지만 알림이 안 뜸

**해결**:

1. 브라우저 알림 권한 확인 (설정 → 사이트 권한)
2. 시스템 알림 설정 확인 (Windows/macOS 알림 센터)
3. Safari의 경우 16.4 이상인지 확인

### 10.3. VAPID 키 오류

**증상**: `JWTError: Invalid public key` 또는 `Invalid VAPID key`

**해결**:

1. VAPID 키를 다시 생성 (`npx web-push generate-vapid-keys`)
2. 환경 변수 재설정 (`.env.local`)
3. 서버 재시작 (`pnpm dev` 중지 후 재실행)

### 10.4. 오프라인 큐가 동기화되지 않음

**증상**: 온라인 복귀 후에도 큐가 비워지지 않음

**해결**:

1. 브라우저 DevTools → Application → IndexedDB → `offline-queue` 확인
2. 콘솔에서 수동 동기화 실행:
   ```javascript
   navigator.serviceWorker.controller.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
   ```
3. Service Worker 재등록 (unregister 후 페이지 새로고침)

## 11. 성능 모니터링

### 11.1. 캐시 크기 확인

```javascript
// 브라우저 콘솔에서 실행
caches.keys().then((names) => {
  names.forEach((name) => {
    caches.open(name).then((cache) => {
      cache.keys().then((keys) => {
        console.log(`${name}: ${keys.length} items`);
      });
    });
  });
});
```

### 11.2. 오프라인 큐 크기 확인

```javascript
// 브라우저 콘솔에서 실행
indexedDB.open('offline-queue').onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction(['requests'], 'readonly');
  const store = tx.objectStore('requests');
  store.count().onsuccess = (e) => {
    console.log(`Offline queue: ${e.target.result} items`);
  };
};
```

## 12. 배포 체크리스트

배포 전 확인 사항:

- [ ] `web-push` 패키지 설치됨
- [ ] VAPID 키 생성 및 환경 변수 설정됨
- [ ] Supabase 마이그레이션 실행됨
- [ ] `/api/push/send/route.ts` 주석 해제됨
- [ ] 프로덕션 빌드 테스트 완료
- [ ] 푸시 알림 권한 요청 UI 확인
- [ ] 오프라인 모드 테스트 완료
- [ ] 다양한 브라우저에서 테스트 완료

## 13. 보안 고려사항

- ✅ VAPID private key는 서버 환경 변수로만 관리
- ✅ 푸시 구독은 작업자별로 격리
- ✅ 푸시 발송 API는 인증된 요청만 허용 (추후 추가 권장)
- ✅ 오프라인 큐는 클라이언트 IndexedDB에 저장 (민감 정보 주의)

---

**작성일**: 2026-02-13
**버전**: 1.0.0
**담당자**: Claude Code Agent
