# LGU+ 외부웹하드 동기화 안내

> 최종 업데이트: 2026-07-09
> 현재 구현 원천: `../외부웹하드동기화프로그램`

LGU+ 외부웹하드(`only.webhard.co.kr`) 수집은 `yjlaser_website` 내부 CLI가 아니라 루트의 `../외부웹하드동기화프로그램` Electron 앱이 담당한다. 이 웹 프로젝트는 자체 웹하드 API와 Google Drive 저장소 계약만 제공한다.

## 현재 구조

```text
LGU+ 외부웹하드
  -> 외부웹하드동기화프로그램 (Electron/TypeScript/SQLite WAL)
  -> yjlaser_website/webhard-api (NestJS 11)
  -> Google Drive 신규 웹하드 파일 + PostgreSQL 메타데이터
```

## 기준 문서

| 목적                  | 문서                                            |
| --------------------- | ----------------------------------------------- |
| 동기화 앱 실행/배포   | `../외부웹하드동기화프로그램/README.md`         |
| 현재 버전/운영 리스크 | `../외부웹하드동기화프로그램/PROJECT_STATUS.md` |
| 릴리스 변경사항       | `../외부웹하드동기화프로그램/CHANGELOG.md`      |
| 웹 API 저장소 계약    | `webhard-api/README.md`                         |

## 현재 코드 기준

- 최신 동기화 앱 버전은 v1.5.40이다.
- 배포 방식은 Windows Electron/NSIS, NAS 자동 업데이트, GitHub Release 폴백이다.
- 신규 자체 웹하드 파일은 Google Drive에 저장한다.
- R2는 포트폴리오/레거시 파일 호환 용도다.
- 실제 운영 설치 앱에서 장시간 LGU+ 세션 만료/자동 재로그인/감지/업로드 회복 검증은 아직 남아 있다.
- LGU+ 자격증명, 자체 웹하드 API key, 고객 도면 파일명/경로는 이 문서에 기록하지 않는다.

## 웹 API 연동 계약

- 인증: `X-API-Key` 또는 `admin-session` 쿠키
- 파일 업로드: `/api/v1/files/presigned-url`, `/api/v1/files/google-drive/upload`, `/api/v1/files/confirm`
- 폴더 관리: `/api/v1/folders`
- 운영 trace: 업로드 결과의 `inquiryNumber`, `workNumber`, `companyId` 등 추적 필드는 raw 파일명/경로를 노출하지 않는 방식으로 기록한다.
