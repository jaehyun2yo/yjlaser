# YJ Laser — Team Briefing

## Project

Integrated web platform for YJ Laser (유진레이저목형) — a B2B die-cutting mold manufacturer.
Covers: public website, admin dashboard, company portal, field worker ERP, and webhard file management.

## Tech Stack

- Frontend: Next.js 15 (App Router, React 19, TypeScript 5 strict)
- Backend: NestJS 11 (`webhard-api/`, Prisma 6 ORM), prefix `/api/v1`
- DB: PostgreSQL (Prisma ORM — all DB access via NestJS API)
- Storage: Google Drive (new webhard files) + Cloudflare R2 (portfolio/legacy compatibility)
- State: React Query v5 (server) + Zustand v5 (client)
- Deployment: Vercel (frontend) + Railway (backend, Docker)

## Hard Rules (violation = rejection)

1. No `any` — explicit types always
2. No `dark:` classes — use `@/lib/styles.ts` constants
3. No `console.log` — use `logger.createLogger()`
4. No relative imports — `@/` absolute paths only
5. No raw query key strings — use `@/lib/react-query/queryKeys.ts`
6. No `window.location.reload()` — use React Query invalidation
7. No direct DB access from Next.js — all DB via NestJS API (Prisma)

## Route Map

| Path         | Purpose                                          | Auth                     |
| ------------ | ------------------------------------------------ | ------------------------ |
| `/`          | Public pages (landing, portfolio, blog, contact) | None                     |
| `/admin/*`   | Admin dashboard, work/order management           | Cookie + env credentials |
| `/company/*` | Company portal: orders, billing, profile         | bcrypt + session cookie  |
| `/worker/*`  | Field worker mobile UI: tasks, PIN login         | Worker PIN               |
| `/webhard/*` | File management UI                               | Company auth             |
| `/api/*`     | Next.js API routes                               | X-API-Key or session     |

## Key Directories

| Path                     | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `src/app/(admin)/admin/` | Admin dashboard pages                                |
| `src/app/company/`       | Company portal pages                                 |
| `src/app/worker/`        | Field worker mobile pages                            |
| `src/app/webhard/`       | Webhard UI (containers/presentational/context/hooks) |
| `src/app/api/`           | Next.js API routes                                   |
| `webhard-api/src/`       | NestJS backend modules                               |
| `docs/specs/`            | Feature/API/DB specifications                        |

## Before Working

1. Read `docs/progress.txt` — current state
2. Read `docs/specs/PRD.md` — feature status board
3. Read the relevant feature spec in `docs/specs/features/`
4. Do NOT read full README.md or WEBHARD_ARCHITECTURE.md (too large)

## Commands

| Command            | Purpose                |
| ------------------ | ---------------------- |
| `pnpm dev`         | Frontend dev (:3000)   |
| `pnpm webhard:dev` | NestJS backend (:4000) |
| `pnpm build`       | Production build       |
| `pnpm test`        | Jest tests             |
| `npx tsc --noEmit` | Type check             |

## Spec-Driven Rules

- Read the feature spec BEFORE modifying code
- If code differs from spec, report to lead (don't guess which is correct)
- After code changes, flag if spec needs updating
