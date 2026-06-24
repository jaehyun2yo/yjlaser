# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Response Language

All responses MUST be in Korean. Exceptions: code identifiers, technical terms, file paths, error messages.

## Commands

```bash
pnpm dev              # Next.js dev (Turbopack, :3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm test             # Jest
npx tsc --noEmit      # Type check (safe to auto-run)
pnpm test -- --testPathPattern="<path>"  # Single test

# NestJS backend (webhard-api/)
pnpm webhard:dev      # NestJS dev (:4000, watch)
pnpm webhard:build    # Build backend
pnpm webhard:prisma   # Prisma client generate
cd webhard-api && npx prisma migrate dev --name <name>  # 마이그레이션 생성
cd webhard-api && npx prisma db seed                     # 시드 데이터
pnpm dev:all          # Both frontend + backend

# Development Setup
bash scripts/setup-dev.sh         # 개발 환경 초기 셋업
bash scripts/setup-dev.sh --dry-run  # 드라이런 (실행 없이 단계 확인)
```

`npx tsc --noEmit` may run automatically. `pnpm build`, `git add/commit/push` require explicit user request.

## Architecture

Monorepo: two apps sharing `.env.local` and one PostgreSQL database (Prisma ORM).

**Next.js frontend** (`src/`) — Vercel

- Next.js 15 App Router + Turbopack, React 19, TypeScript 5 strict
- Tailwind CSS 4 via centralized constants (`@/lib/styles.ts`)
- React Query (`queryKeys` factory) + Zustand
- All DB access via NestJS API (`nestjs-server-client.ts`)
- Google Drive webhard storage, Cloudflare R2 portfolio/legacy storage, Sentry (prod), Inngest background jobs

**NestJS backend** (`webhard-api/`) — Railway (Docker)

- NestJS 10, Prisma ORM (sole DB access layer), Socket.IO, prefix `/api/v1`
- 37 Prisma models: Contact, ContactStatusHistory, Company, CompanyStorage, CompanyFeedback, VisitBooking, Portfolio, Post, WebhardFile, WebhardFolder, WebhardFolderFavorite, WebhardSettings, WebhardUserSettings, WebhardLog, WebhardSyncHistory, WebhardSyncState, Machine, Task, ErpWorker, WorkerAccessLog, WorkerNote, Order, OrderEvent, Delivery, DeliveryCompany, InventoryItem, InventoryTransaction, ApiKey, ProgramHeartbeat, SyncLog, ActivityLog, Notification, PushSubscription, ShareLink, ActiveSession, SystemSetting, NumberCounter
- Modules: Auth, Files, Folders, Trash, Search, Storage, ERP, Integration, Contacts, Companies, Bookings, Notifications, PublicData, Sessions, ActivityLogs, Feedback, ShareLinks, Sync, Health, Settings, Events, DeliveryCompanies, PushSubscriptions, Mail

Next.js never accesses PostgreSQL directly — all DB operations go through NestJS API.

## Auth

| Method        | Scope                    | Mechanism                                                         |
| ------------- | ------------------------ | ----------------------------------------------------------------- |
| Admin session | `/admin/*`               | Cookie + env credentials (`ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`) |
| Company auth  | `/company/*`, `/webhard` | Password hash (bcrypt) + session cookie via NestJS                |
| API key       | CLI/external programs    | `X-API-Key` header, timing-safe compare                           |
| Worker PIN    | `/worker/*`              | PIN hash via NestJS `erp_workers` table                           |

## Routes

- `/` — public pages (landing, portfolio, blog, contact, about)
- `/login`, `/register` — company auth pages
- `/notice`, `/notice/[slug]` — notice pages
- `/webhard` — company webhard file access
- `/admin/*` — admin dashboard, work management, integration, webhard management (route group `(admin)`)
- `/company/*` — company portal: orders, billing, profile, feedback
- `/worker/*` — field worker mobile UI: tasks, PIN login
- `/api/*` — Next.js API routes (incl. `/api/auth/`, `/api/debug/`, `/api/erp/`, `/api/push/`, `/api/sync/`, `/api/worker/`, `/api/inngest/`)

## Conventions

**Styling** — CSS variable-based design tokens in `globals.css`, consumed via `@/lib/styles` (TS constants) or Tailwind utilities (`bg-brand`, `text-success`). Dark mode is automatic via CSS variables — no `dark:` classes. For new interactive elements, use UI components from `@/components/ui/` (`<Button>`, `<Input>`, `<Badge>`, etc.) instead of string constants. Portfolio pages are always light mode (`data-portfolio-page="true"`).

**React Query** — Always use `queryKeys` factory from `@/lib/react-query/queryKeys.ts`. Never raw string arrays. After mutations, invalidate specific queries — never `window.location.reload()`.

**Realtime** — Use `useSocketNamespace` hook from `@/lib/socket/useSocketNamespace.ts`. Always return cleanup in `useEffect`.

**Files** — Local: `_components/`, `_lib/` (underscore = private). Used 2+ places → move to global `components/` or `lib/`. Always `@/` imports, never relative.

**Logging** — `logger.createLogger('Name')` from `@/lib/utils/logger`. No `console.log`.

**Components** — Server Components by default. `'use client'` only when interactive.

**NestJS** — DTOs with `class-validator`. Global `ValidationPipe` (whitelist + forbidNonWhitelisted). `AuditLogInterceptor` globally. Env load order: `../.env.local` → `../.env` → `.env.local` → `.env`.

## Git

Commit messages in Korean. Format:

```
<type>: <제목>

- 변경사항
```

Types: `feat`, `fix`, `refactor`, `style`, `docs`, `chore`, `perf`, `test`

Only commit/push when the user explicitly asks. Stage only files that belong to the current task; do not use broad `git add .` when unrelated dirty files exist.

## Parent Review Directives

When the parent project assigns work from `docs/parent-review/`, start with:

1. `PROJECT_STATUS.md`
2. `docs/parent-review/README.md`
3. the relevant `docs/parent-review/*.md`
4. this file and `AGENTS.md`

After completing the directive, update the child directive status and any changed source status docs before reporting back to the parent project.

## Env Vars

All env vars are in root `.env.local` (shared by Next.js and NestJS). NestJS loads `../../.env.local` first (see `webhard-api/src/main.ts`). `webhard-api/.env` is NOT used — do not create it.

Dev/Prod separation:

- Dev: `.env.local` points to dev Supabase + development Google Drive storage + `yjlaser-dev` R2 bucket
- Prod: Vercel/Railway dashboards have production values

- `DATABASE_URL` — PostgreSQL via Supabase Pooler (Transaction mode, port 6543, pgbouncer)
- `DIRECT_URL` — PostgreSQL direct connection (port 5432, for migrations only)
- `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_SHARED_DRIVE_ID` — Google Drive webhard storage
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, `R2_ENDPOINT` — R2 portfolio/legacy storage
- `SESSION_SECRET` — cookie encryption
- `USE_SECURE_COOKIES` — cookie security flag
- `COOKIE_DOMAIN` — cookie domain
- `MIGRATION_API_KEY` — API auth
- `INTEGRATION_API_KEY` — external integration API key
- `NESTJS_PORT` / `PORT` — backend port (default 4000)
- `CORS_ORIGINS` — comma-separated origins
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` — mail delivery
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — rate limiting
- `NEXT_PUBLIC_WEBHARD_API_URL` — webhard API base URL (frontend)
- `NEXT_PUBLIC_SENTRY_DSN` — Sentry error tracking frontend (prod only)
- `SENTRY_DSN` — Sentry error tracking NestJS backend (prod only)
- `NEXT_PUBLIC_SITE_URL` — public site URL (e.g. https://yjlaser.com)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — web push VAPID public key

## Hard Rules

- No `any` — explicit types always
- No `dark:` classes — CSS variables handle dark mode automatically
- No `console.log` — use logger
- No relative imports — use `@/`
- No raw query keys — use `queryKeys` factory
- No skipping `useEffect` cleanup
- No `window.location.reload()` — invalidate queries
- No direct DB access from Next.js — all DB via NestJS API (Prisma)
- No `BUTTON_STYLES`/`INPUT_STYLES` for new code — use `<Button>`, `<Input>` from `@/components/ui/`
- No auto build/commit/push — user must request

## CLAUDE.md Maintenance

English only. < 200 lines. Project-specific patterns only. Update when architecture/conventions change.
