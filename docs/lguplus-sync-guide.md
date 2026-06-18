# LGU+ 웹하드 ↔ 자체 웹하드 동기화 가이드

LGU+ 웹하드(`https://only.webhard.co.kr/`)의 게스트 폴더 파일을 자동으로 다운로드하고 자체 웹하드로 동기화하는 도구입니다.

## 목차

1. [빠른 시작](#빠른-시작)
2. [명령어 모음](#명령어-모음)
3. [환경 설정](#환경-설정)
4. [동기화 설정](#동기화-설정)
5. [로그 모니터링](#로그-모니터링)
6. [폴더 매핑](#폴더-매핑)
7. [API 엔드포인트](#api-엔드포인트)
8. [트러블슈팅](#트러블슈팅)

---

## 빠른 시작

### 1. 환경 설정

```bash
cd lguplus-webhard-sync

# .env 파일 생성
cp .env.example .env
```

`.env` 파일 수정:

```env
# LGU+ 웹하드 접속 정보
LGUPLUS_URL=https://only.webhard.co.kr
LGUPLUS_USERNAME=your_username
LGUPLUS_PASSWORD=your_password
DOWNLOAD_DIR=./downloads

# 자체 웹하드 연동 (선택)
SYNC_TO_SELF_WEBHARD=true
SELF_WEBHARD_URL=http://localhost:3000
SELF_WEBHARD_API_KEY=your-api-key
SELF_WEBHARD_ADMIN_ID=1
```

### 2. 실시간 동기화 시작

```bash
# 실시간 동기화 (5분 간격)
npx tsx sync-watch.ts

# 또 다른 터미널에서 로그 모니터링
npx tsx log-viewer.ts
```

---

## 명령어 모음

### 동기화 명령어

| 명령어                                    | 설명                           |
| ----------------------------------------- | ------------------------------ |
| `npx tsx sync-watch.ts`                   | 실시간 동기화 (5분 간격)       |
| `npx tsx sync-watch.ts --once`            | 1회 동기화 후 종료             |
| `npx tsx sync-watch.ts --interval=1`      | 1분 간격 동기화                |
| `npx tsx sync-watch.ts --folder=팩토리엠` | 특정 폴더만 동기화             |
| `npx tsx sync-watch.ts --dry-run`         | 테스트 모드 (실제 업로드 안함) |
| `npx tsx sync-watch.ts --no-upload`       | 다운로드만 (업로드 비활성화)   |

### 로그 명령어

| 명령어                                    | 설명               |
| ----------------------------------------- | ------------------ |
| `npx tsx log-viewer.ts`                   | 실시간 로그 감시   |
| `npx tsx log-viewer.ts --tail 100`        | 마지막 100줄 표시  |
| `npx tsx log-viewer.ts --errors`          | 에러/경고만 필터링 |
| `npx tsx log-viewer.ts --search "키워드"` | 키워드 검색        |
| `npx tsx log-viewer.ts --date 2025-12-21` | 특정 날짜 로그     |
| `npx tsx log-viewer.ts --list`            | 로그 파일 목록     |

### 유틸리티 명령어

| 명령어                                    | 설명                     |
| ----------------------------------------- | ------------------------ |
| `npx tsx test-api-connection.ts`          | API 연결 테스트          |
| `npx tsx download-all.ts`                 | 전체 다운로드 (최초 1회) |
| `npx tsx download-all.ts --skip-existing` | 기존 파일 스킵           |

---

## 환경 설정

### 필수 환경 변수

| 변수               | 설명            | 예시                         |
| ------------------ | --------------- | ---------------------------- |
| `LGUPLUS_URL`      | LGU+ 웹하드 URL | `https://only.webhard.co.kr` |
| `LGUPLUS_USERNAME` | 로그인 아이디   | `admin`                      |
| `LGUPLUS_PASSWORD` | 로그인 비밀번호 | `password123`                |
| `DOWNLOAD_DIR`     | 다운로드 폴더   | `./downloads`                |

### 자체 웹하드 연동 환경 변수

| 변수                    | 설명          | 예시                    |
| ----------------------- | ------------- | ----------------------- |
| `SYNC_TO_SELF_WEBHARD`  | 동기화 활성화 | `true` / `false`        |
| `SELF_WEBHARD_URL`      | 서버 URL      | `http://localhost:3000` |
| `SELF_WEBHARD_API_KEY`  | API 인증 키   | `b7dc3405ed2b...`       |
| `SELF_WEBHARD_ADMIN_ID` | 관리자 ID     | `1`                     |

### 선택 환경 변수

| 변수       | 설명               | 기본값  |
| ---------- | ------------------ | ------- |
| `HEADLESS` | 브라우저 숨김 모드 | `true`  |
| `DEBUG`    | 디버그 로그 활성화 | `false` |

---

## 동기화 설정

### 동기화 플로우

```
┌─────────────────────────────────────────────────────────────────┐
│                    실시간 동기화 플로우                           │
│                                                                  │
│  1. 브라우저 시작 → 로그인                                        │
│       ↓                                                          │
│  2. sync-state.json 로드 (마지막 동기화 상태)                     │
│       ↓                                                          │
│  3. 게스트 폴더 → 모든 업체 폴더 순회                             │
│       ↓                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  각 폴더에서:                                             │    │
│  │  - 파일 목록 조회                                         │    │
│  │  - sync-state.json과 비교                                 │    │
│  │    → 신규: ID가 없으면 다운로드                           │    │
│  │    → 업데이트: updatedAt이 다르면 다운로드                │    │
│  │    → 기존: 스킵                                           │    │
│  │  - 다운로드 완료 시 상태 업데이트                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│       ↓                                                          │
│  4. 자체 웹하드 업로드 (활성화된 경우)                            │
│       │                                                          │
│       ├─ 고객사 가입됨 → 해당 고객사 폴더에 업로드              │
│       └─ 미가입/매핑 없음 → 'LGU+ 동기화' 관리자 폴더에 업로드  │
│       ↓                                                          │
│  5. sync-state.json 저장                                         │
│       ↓                                                          │
│  6. N분 대기 후 반복                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 안정성 설정

| 기능                | 설정값      | 설명                      |
| ------------------- | ----------- | ------------------------- |
| 다운로드 간 딜레이  | 2초         | 서버 부하 방지            |
| 폴더 탐색 간 딜레이 | 2초         | 페이지 로드 대기          |
| 배치 처리           | 20개        | 20개 다운로드 후 5초 휴식 |
| 브라우저 헬스체크   | 매 다운로드 | 크래시 감지               |
| 중간 저장           | 10개마다    | 진행 상황 보존            |
| 자동 재시작         | 크래시 시   | 5초 대기 후 재시작        |

---

## 로그 모니터링

### 로그 파일 위치

```
lguplus-webhard-sync/logs/
├── sync-2025-12-21.log
├── sync-2025-12-20.log
└── ...
```

### 로그 뷰어 사용법

```bash
# 실시간 감시 (오늘 로그)
npx tsx log-viewer.ts

# 마지막 N줄 표시
npx tsx log-viewer.ts --tail 50

# 에러만 필터링
npx tsx log-viewer.ts --errors

# 키워드 검색
npx tsx log-viewer.ts --search "팩토리엠"

# 특정 날짜 로그
npx tsx log-viewer.ts --date 2025-12-20

# 로그 파일 목록
npx tsx log-viewer.ts --list
```

### 로그 레벨

| 레벨    | 색상 | 설명        |
| ------- | ---- | ----------- |
| `ERROR` | 빨강 | 오류 발생   |
| `WARN`  | 노랑 | 경고        |
| `INFO`  | 초록 | 일반 정보   |
| `DEBUG` | 회색 | 디버그 정보 |

---

## 폴더 매핑

### folder-mapping.json 구조

```json
{
  "version": "1.0",
  "mappings": [
    {
      "lguplusFolderName": "팩토리엠",
      "lguplusFolderId": "63733347",
      "selfWebhardCompanyId": 123,
      "selfWebhardCompanyName": "팩토리엠",
      "targetFolderId": null,
      "status": "active"
    }
  ],
  "excludedFolders": ["GUEST그룹", "테스트"],
  "defaultBehavior": "upload_as_admin",
  "settings": {
    "adminSyncFolderName": "LGU+ 동기화",
    "autoCreateCompanyFolder": true,
    "preserveOriginalFileName": true
  }
}
```

### 매핑 필드 설명

| 필드                     | 설명                                   |
| ------------------------ | -------------------------------------- |
| `lguplusFolderName`      | LGU+ 폴더명                            |
| `lguplusFolderId`        | LGU+ 폴더 ID                           |
| `selfWebhardCompanyId`   | 자체 웹하드 고객사 ID (null = 미가입)  |
| `selfWebhardCompanyName` | 자체 웹하드 고객사명                   |
| `targetFolderId`         | 업로드 대상 폴더 ID (null = 자동 생성) |
| `status`                 | `active` / `paused` / `disabled`       |

### 매핑 동작

- `selfWebhardCompanyId`가 있음 → 해당 고객사 폴더에 업로드
- `selfWebhardCompanyId`가 null → 'LGU+ 동기화' 관리자 폴더에 업로드
- `status`가 `active`가 아님 → 해당 폴더 업로드 스킵

---

## API 엔드포인트

동기화 스크립트가 사용하는 서버 API 목록입니다.

### 헬스 체크

```
GET /api/health
```

### 폴더 관리

```
GET /api/webhard/migration/sync/folders
  - name: 폴더명
  - parent_id: 부모 폴더 ID
  - company_id: 고객사 ID

POST /api/webhard/migration/sync/folders
  - name: 폴더명
  - parent_id: 부모 폴더 ID
  - company_id: 고객사 ID (null = 관리자 폴더)
```

### 파일 업로드

```
POST /api/webhard/migration/sync/upload
  - file: 파일 (FormData)
  - folder_id: 대상 폴더 ID
  - original_name: 원본 파일명
```

### 파일 존재 확인

```
GET /api/webhard/migration/sync/files/exists
  - folder_id: 폴더 ID
  - name: 파일명
```

### 고객사 연동

```
POST /api/webhard/migration/link-company
  - lguplus_folder_id: LGU+ 폴더 ID
  - company_id: 자체 웹하드 고객사 ID
```

### 인증

모든 API는 다음 중 하나로 인증합니다:

- 세션 쿠키 (웹 로그인)
- `x-api-key` 헤더 (동기화 스크립트)

---

## 트러블슈팅

### 브라우저 크래시

**증상:** 연속 다운로드 80~100개에서 멈춤

**해결:**

- 자동 재시작 기능이 내장되어 있음
- `sync-state.json`에 진행 상황이 저장됨

### 로그인 실패

**확인 사항:**

1. `.env` 파일 자격 증명 확인
2. 웹하드 사이트 직접 접속하여 로그인 가능 여부 확인
3. 관리자 계정인지 확인

### API 연결 실패

**확인 사항:**

```bash
# 서버 실행 중인지 확인
curl http://localhost:3000/api/health

# API 연결 테스트
npx tsx test-api-connection.ts
```

### 동기화가 안 될 때

**확인 사항:**

1. `sync-state.json` 삭제 후 재시작 (전체 재동기화)
2. `folder-mapping.json`에서 해당 폴더 상태 확인
3. 로그에서 에러 메시지 확인

```bash
npx tsx log-viewer.ts --errors
```

---

## 주요 파일

| 파일                     | 설명                   |
| ------------------------ | ---------------------- |
| `sync-watch.ts`          | 실시간 동기화 스크립트 |
| `download-all.ts`        | 전체 다운로드 스크립트 |
| `log-viewer.ts`          | 로그 뷰어              |
| `test-api-connection.ts` | API 연결 테스트        |
| `sync-state.json`        | 동기화 상태 저장       |
| `folder-mapping.json`    | 폴더 매핑 설정         |
| `logs/`                  | 로그 파일 디렉토리     |
| `src/self-webhard/`      | 자체 웹하드 연동 모듈  |

---

## 문의

문제가 발생하면 로그 파일을 확인하고, GitHub Issues에 문의해주세요.
