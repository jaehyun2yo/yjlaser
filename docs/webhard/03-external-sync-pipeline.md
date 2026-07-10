# 외부웹하드 동기화 파이프라인

> 최종 업데이트: 2026-07-09
> 현재 구현 원천: `../외부웹하드동기화프로그램`

이 문서는 `yjlaser_website`가 외부웹하드 동기화 앱과 맺는 현재 API/저장소 계약을 설명한다. 과거 내부 CLI와 양방향 동기화 설계는 더 이상 현재 구현 기준이 아니다.

## 현재 파이프라인

```text
LGU+ only.webhard.co.kr
  -> 외부웹하드동기화프로그램
     - Electron + React + TypeScript
     - Playwright/HTTP 세션
     - SQLite WAL 이벤트/체크포인트/DLQ
     - NAS 자동 업데이트 + GitHub Release 폴백
  -> yjlaser_website/webhard-api
     - NestJS 11 + Prisma 6
     - X-API-Key 또는 세션 인증
     - Google Drive upload session/proxy
  -> Google Drive + PostgreSQL metadata
```

## 책임 분리

| 영역                  | 소유 프로젝트                 | 현재 책임                                                     |
| --------------------- | ----------------------------- | ------------------------------------------------------------- |
| LGU+ 로그인/세션 복구 | `외부웹하드동기화프로그램`    | 세션 만료, `78000` 인증 서버 오류 재로그인, 업로드 이력 감지  |
| 다운로드/DLQ          | `외부웹하드동기화프로그램`    | 파일 다운로드, 실패 재시도, SQLite DLQ 기록                   |
| 자체 웹하드 업로드    | `yjlaser_website/webhard-api` | 파일 업로드 세션 발급, Drive 프록시, confirm, 메타데이터 저장 |
| 저장소                | `yjlaser_website/webhard-api` | 신규 파일 Google Drive, 포트폴리오/레거시 R2                  |
| 운영 검증             | 양쪽                          | v1.5.40 설치 앱 장시간 감지/재로그인/업로드 회복 확인         |

## 주요 API

| API                                     | 용도                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `POST /api/v1/files/presigned-url`      | 업로드 세션 생성. Google Drive 대상이면 Drive upload URL/proxy 정보를 반환 |
| `PUT /api/v1/files/google-drive/upload` | 브라우저/앱에서 Drive resumable upload session으로 바이트 전송             |
| `POST /api/v1/files/confirm`            | 업로드 완료 확인, `webhard_files` 메타데이터 저장                          |
| `POST /api/v1/files/batch/upload`       | 배치 업로드 준비                                                           |
| `GET /api/v1/folders`                   | 대상 폴더 조회                                                             |
| `POST /api/v1/folders`                  | 필요한 폴더 생성                                                           |

## 운영 주의

- 실제 LGU+ 동기화 실행, 고객 도면 다운로드/업로드, 원격 파일 이동/삭제는 명시 승인 대상이다.
- 로그에는 raw 파일명, 고객 도면 내용, API key, 쿠키, presigned URL, Drive upload URL을 남기지 않는다.
- v1.5.40 기준 업로드 완료 오늘 표시/무한스크롤, 대성목형 레이저가공 태그, `78000` 재로그인 복구는 배포 검증에 포함됐지만 운영 PC 장시간 확인은 별도 과제로 남아 있다.
