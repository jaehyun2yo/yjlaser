# Company Site Visual Audit

최종 갱신일: 2026-05-13

## 범위

공개 회사사이트 주요 surface를 release 전 시각 QA 대상으로 분류한다.

- Main: `/`
- Portfolio: `/portfolio`, `/portfolio/[id]`
- Blog/Notice: `/blog`, `/notice`, 상세 페이지
- Contact: `/contact`
- Company intro: `/about`

## 검증 방식

이번 문서는 소스 구조와 기존 디자인 시스템 기준의 사전 감사다. 실제 브라우저 screenshot은 release QA runbook의 Design visual smoke에서 desktop 1440px, mobile 390px로 별도 증거를 남긴다.

## 페이지별 QA 메모

| 페이지    | Desktop 메모                                                                                                                                                  | Mobile 메모                                                                                                                                | 위험도 | 개선 우선순위                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------- |
| Main      | 3D hero와 box/process/portfolio/inquiry 흐름은 첫 화면 신호가 강함. `#0a0a0a`, `#ED6C00` raw color와 큰 transition band가 디자인 시스템 token과 분리되어 있음 | hero canvas가 idle 이후 로드되므로 초기 텍스트/CTA가 canvas 없이도 충분히 보여야 함. 390px에서 hero text와 box selector overflow 확인 필요 | P2     | Hero fallback screenshot, raw color token 정리       |
| Portfolio | hero, filter, magazine gallery 구조가 명확함. 빈 portfolio 상태와 이미지 비율 mismatch를 확인해야 함                                                          | filter chip/검색 UI가 줄바꿈될 때 gallery 시작 위치가 과하게 밀리지 않는지 확인 필요                                                       | P2     | 빈 상태/이미지 fallback, filter wrap QA              |
| Blog      | 현재 `/blog`가 `jsonplaceholder.typicode.com/posts`를 직접 사용해 공개 브랜드 콘텐츠와 맞지 않음                                                              | 카드 3열 구조는 모바일 1열로 접히지만 placeholder 본문 길이에 따라 카드 높이만 맞음                                                        | P1     | 운영 콘텐츠 소스로 전환하거나 release에서 숨김 결정  |
| Notice    | NestJS posts를 사용하고 dark hero/table 구조가 있음. raw brand hex와 radial gradient가 남아 있음                                                              | table header가 숨겨지고 row 중심으로 접히는지, 제목/날짜/조회수 정보가 겹치지 않는지 확인 필요                                             | P2     | 모바일 row layout screenshot, token 정리             |
| Contact   | 포트폴리오 product context와 업체 로그인 prefill이 연결되어 기능적으로 중요함. 폼 길이가 길어 section hierarchy 확인 필요                                     | 파일 업로드/방문예약/견적방법이 긴 폼 안에서 오류 위치로 스크롤되는지 확인 필요                                                            | P1     | 390px 폼 validation QA, 긴 label/input overflow 확인 |
| About     | intro/history/process tab 구조가 명확함. hero가 notice/portfolio와 유사해 일관성은 있음                                                                       | tab이 3개 이상일 때 좌우 overflow 또는 wrapping 품질 확인 필요                                                                             | P2     | tab mobile layout, raw brand hex token 정리          |

## 우선순위

1. `/blog` placeholder 데이터 사용 여부를 release 전에 결정한다. 공개 브랜드 품질상 P1이다.
2. `/contact` 모바일 긴 폼의 validation scroll, file upload, 방문예약 섹션을 실제 기기로 확인한다.
3. Main hero는 canvas가 늦게 로드되거나 실패해도 첫 viewport에서 브랜드/CTA가 유지되는지 캡처한다.
4. public pages의 raw `#ED6C00`, `#0a0a0a`, `dark:`/gradient 사용을 디자인 시스템 migration backlog로 묶는다.
5. portfolio/notice/about은 mobile 390px screenshot으로 제목, tab/filter, row/card overflow를 확인한다.

## Release Gate

- P1 항목(`/blog` 콘텐츠 출처, `/contact` 모바일 폼)은 release 전에 pass 또는 deferred 사유가 필요하다.
- P2 항목은 visual smoke 증거를 남기고 후속 디자인 시스템 ticket으로 관리한다.
