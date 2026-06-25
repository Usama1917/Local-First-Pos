# نظام نقاط البيع والمخزون — Local-First POS

A local-first, Arabic-first (RTL) point-of-sale and inventory system for an Egyptian
sanitary-ware / paints / plumbing shop. Runs entirely on a local SQLite database with no
cloud dependency. Target runtime is a Windows shop machine; development is on macOS.

## Run & Operate

- **Node 24 is required** — the API server uses the built-in `node:sqlite` module
  (`DatabaseSync`), which only exists on Node ≥ 22.5 (use Node 24). On Node 20 the
  server throws `No such built-in module: node:sqlite`. Use `nvm use 24` (an `.nvmrc`
  pinning `24` is provided).
- API server: `pnpm --filter @workspace/api-server run dev` — builds (esbuild) then runs
  on `PORT` (artifact default `8080`). Health check: `GET /api/healthz`.
- Web (POS SPA): `pnpm --filter @workspace/pos run dev` — Vite dev server; requires
  `PORT` and `BASE_PATH` env vars (artifact defaults `24730` / `/`).
- Local dev wiring: outside Replit the SPA proxies `/api` → `http://localhost:8080`
  (override with `API_PROXY_TARGET`). On Replit the platform router dispatches `/api`
  to the API service, so the proxy is disabled there.
- `pnpm run typecheck` — typecheck all packages. `pnpm --filter @workspace/api-spec run codegen`
  — regenerate the API client + Zod schemas from `lib/api-spec/openapi.yaml`.
- The SQLite file lives at `data/store.db` (committed with seed data). Schema is created
  idempotently on every server start via `initializeSchema()` (`CREATE TABLE/INDEX IF NOT EXISTS`).

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9
- API: Express 5, bundled with esbuild → single ESM file (`artifacts/api-server/dist/index.mjs`)
- DB: **local SQLite via `node:sqlite`** (not Postgres; the `lib/db` Drizzle/Postgres
  package is unused scaffolding from the template)
- Web: React 19 + Vite 7, Tailwind v4, Radix UI, wouter (routing), TanStack Query, sonner
- API contract: OpenAPI (`lib/api-spec/openapi.yaml`) → Orval codegen → `lib/api-client-react`
  (React-Query hooks) + `lib/api-zod` (Zod schemas)

## Where things live

- DB schema + helpers (source of truth): `artifacts/api-server/src/lib/db.ts`
- API routes: `artifacts/api-server/src/routes/*.ts` (mounted in `routes/index.ts` under `/api`)
- POS SPA pages: `artifacts/pos/src/pages/*.tsx`; shared layout in `src/components/layout.tsx`
- Generated API client (do not edit by hand): `lib/api-client-react/src/generated/`
- OpenAPI spec (edit this, then run codegen): `lib/api-spec/openapi.yaml`

## Architecture decisions

- **SQLite via `node:sqlite`** for a zero-dependency local DB (no native module to compile),
  at the cost of requiring Node ≥ 22.5.
- **Craftsman ↔ Customer linking**: a sales invoice / quotation may carry both a `customerId`
  and a `craftsmanId` (the introducer/worker), independently optional. The craftsman is a
  link only — see the debt rule below.
- **Debt belongs to the customer**, never the craftsman. `remainingAmount` on an invoice is
  the customer's debt; it surfaces in customer debt totals and the debts page. Craftsman
  commission (`craftsmanCommission`, % from `craftsmen.commissionPercent`) is tracked
  separately and never mixed into debt.
- **Quotation → invoice** conversion preserves both `customerId` and `craftsmanId`, sets the
  invoice's `quotationId`, and back-links the quotation via `convertedInvoiceId`.

## Product

POS/cashier, products, inventory & stock movements, stock counts, quotations, sales &
purchase invoices, customers, craftsmen, suppliers, customer/supplier debts, reports,
printing, and backup/restore — all Arabic RTL.

## Gotchas

- **Native binaries are stripped for Replit's linux-x64 deploy.** `pnpm-workspace.yaml`
  `overrides` exclude all non-linux-x64 binaries for esbuild / rollup / lightningcss /
  @tailwindcss/oxide. As a result, **Vite and the esbuild build will not run on macOS or
  Windows** out of the box. To run/build off-Replit, those host-platform binaries must be
  restored (remove the relevant `overrides` lines and reinstall, or set `ESBUILD_BINARY_PATH`
  for esbuild). This is the main blocker for true local-first operation on the shop's Windows PC.
- **The OpenAPI spec lags the hand-written backend** in several places (e.g. list responses'
  `items` field, `QuotationInput.status`, reports' `dateFrom`/`dateTo` params). The frontend
  is written against the real backend (mostly via `as any`), so the app runs correctly, but
  `pnpm --filter @workspace/pos run typecheck` reports type-only errors on some pages
  (inventory/reports/purchases/settings). Fix by updating `openapi.yaml` and re-running codegen.
- Neither the Vite dev server nor `vite build` run `tsc`; the esbuild API build doesn't either.
  So type errors do not block running or shipping — run `pnpm run typecheck` explicitly.
- Customer/supplier payment mutation hooks take `{ id, data }` (the path param is `id`),
  not `{ customerId, ... }`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
