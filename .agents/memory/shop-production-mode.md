---
name: Shop production mode (Windows one-click)
description: How the POS actually runs in the real Egyptian shop vs. dev mode
---

The app is installed and running on the **real Windows shop PC** (Node 24 + Git + pnpm).
Demo/seed data was cleaned safely once (backup taken first, DB **not** deleted, schema
unchanged, dashboard totals went to zero) — the DB is now ready for real shop data.

**Production/shop mode = one local origin on port 8080.** The API server serves **both**
`/api/*` and the built frontend (`artifacts/pos/dist/public`). Shop URL: `http://localhost:8080`
(health: `/api/healthz` → `{"status":"ok"}`). The owner opens it with **one double-click**
on the desktop shortcut **«نظام المحل»** (→ `Start POS Hidden.vbs` → `Start POS.bat`); no
terminal, no commands, no ports. Owner is **non-technical** — if it won't open, contact
admin/developer.

**Dev mode is different:** two servers — API on 8080 + Vite dev on 24730 (proxies `/api`).
`:24730` is **development only**; the shop never uses it.

**Why:** the whole operational model for the shop is the one-click shortcut on 8080. Never
assume the owner runs commands or uses 24730.

**How to apply:**
- Daily one-click: `Start POS.bat` / `Start POS Hidden.vbs` (skip a 2nd server if 8080 is
  already listening; log to `logs/pos-server.log`). First-time admin: `Setup POS.bat`.
  Admin update: `Update POS.bat` (**backs up `data/store.db` before `git pull`**).
  `Stop POS.bat` = admin/support. `Create Desktop Shortcut.vbs` = make the shortcut.
- **Never** delete `data/store.db`; **never** commit the real shop DB, backups, or logs
  (`.gitignore` covers `data/*.db`, `backups/`, `logs/`, `PRODUCTION_DATA_CLEANUP_NOTE.txt`).
  Always back up before updates.
- Do **not** touch invoice/inventory/debt/customer/craftsman/supplier/report business logic
  unless explicitly asked.
- Staff usage help lives in a separate ChatGPT project seeded from
  `docs/SHOP_CHATGPT_ASSISTANT_PROMPT_AR.md`.
- Local macOS dev: keep `pnpm-workspace.yaml` `allowBuilds:` at `esbuild: true` /
  `better-sqlite3: false` so newer pnpm's deps check doesn't hard-fail `pnpm run dev`.
