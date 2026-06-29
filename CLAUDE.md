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
- `products.soldByWeight`: 0 = by piece (gets barcode + stickers, integer qty); 1 = by
  weight (no barcode, fractional qty, per‑unit prices). Empty barcode ⇒ never printed.
- **Adding a DB column?** add it to `CREATE TABLE` **and** call `ensureColumn()` in
  `db.ts` (CREATE IF NOT EXISTS won't alter an existing DB). Restart the API after backend
  edits (`dev` = build && start, not watch).

> **Latest work + the “what's next” list live in [`AGENTS.md`](./AGENTS.md) §7** (the
> 2026‑06‑27 block is uncommitted). Top next task: sell‑by‑weight in the cashier.

## Map
- Routes: `artifacts/api-server/src/routes/*.ts` · DB: `…/src/lib/db.ts` (`nextBarcode`, `ensureColumn`)
- Pages: `artifacts/pos/src/pages/*.tsx` · UI: `artifacts/pos/src/components/ui/*` (incl. `barcode.tsx`, `tabs.tsx`)
- Barcode scanner hook: `artifacts/pos/src/hooks/use-barcode-scanner.ts` · label printing: `…/src/lib/print-labels.ts`
- Arabic→Western digits: `toWesternDigits` in `…/src/lib/format.ts` (wired into `components/ui/input.tsx`)
- API spec (edit + codegen): `lib/api-spec/openapi.yaml` → `lib/api-client-react` (don't hand‑edit `generated/`)
