# CLAUDE.md

Arabic‑first (RTL) **local‑first** POS & inventory system for an Egyptian
sanitary‑ware / paints / plumbing shop. Target runtime: **Windows** shop PC.
Dev: **macOS**. DB: **local SQLite**. No cloud.

> **Full handoff doc: [`AGENTS.md`](./AGENTS.md)** (architecture, changelog,
> troubleshooting). Stack/run reference: [`replit.md`](./replit.md). Read AGENTS.md
> before non‑trivial work.

## Must‑know before editing
- **Use Node 24.** The API uses built‑in `node:sqlite` (needs Node ≥ 22.5); the
  default `node` is v20 and will crash. `nvm use 24` (`.nvmrc` = 24).
- **DB = SQLite via `node:sqlite`, NOT Postgres.** Real schema:
  `artifacts/api-server/src/lib/db.ts` (`initializeSchema()` is idempotent, runs on
  boot). `lib/db` (Drizzle/PG) is **unused** scaffolding.
- **Backend is hand‑written; frontend uses generated hooks from an OpenAPI spec.**
  Change a route shape → update `lib/api-spec/openapi.yaml` →
  `pnpm --filter @workspace/api-spec run codegen`. List endpoints return `{ items, total }`.
- **UI is RTL/Arabic.** App is wrapped in Radix `<DirectionProvider dir="rtl">`
  (App.tsx) + `<html lang="ar" dir="rtl">` — without it, tables inside Tabs flip LTR.
- **pnpm is strict** — a package imports only its *direct* deps; add new libs to its
  `package.json` + `pnpm install`.
- **Don't commit `data/store.db*`** (local/test data). Stage source files only.

## Run locally
```bash
nvm use 24
PORT=8080 pnpm --filter @workspace/api-server run dev          # API → :8080 (/api/healthz)
PORT=24730 BASE_PATH=/ pnpm --filter @workspace/pos run dev    # SPA → :24730 (proxies /api)
```
Checks: `pnpm run typecheck` · `pnpm run build` · `pnpm --filter @workspace/api-spec run codegen`.

## Domain rules (don't break)
- Invoices/quotations may carry **both** `customerId` and `craftsmanId` (introducer).
- **Debt belongs to the customer**, never the craftsman. Craftsman **commission** is
  tracked separately. Never mix customer/supplier debt and commission.
- Quotation→invoice convert preserves both ids + the link.
- `/craftsmen/:id/customers` uses correlated subqueries (no JOIN fan‑out) — keep it.

## Map
- Routes: `artifacts/api-server/src/routes/*.ts` · DB: `…/src/lib/db.ts`
- Pages: `artifacts/pos/src/pages/*.tsx` · UI: `artifacts/pos/src/components/ui/*`
- Barcode scanner hook: `artifacts/pos/src/hooks/use-barcode-scanner.ts`
- API spec (edit + codegen): `lib/api-spec/openapi.yaml` → `lib/api-client-react` (don't hand‑edit `generated/`)
