---
name: POS System route conventions
description: URL path conventions for the Egyptian retail POS API routes
---

The Orval-generated client uses hyphenated paths (e.g. `/api/stock-counts`) while the original hand-written backend used slash-separated paths (`/api/stock/counts`). Both are now registered as aliases in `artifacts/api-server/src/routes/stock.ts` using shared handler functions.

**Why:** The OpenAPI spec drove the generated client URLs; the hand-written backend predated the spec. Rather than regenerate, we kept both paths.

**How to apply:** When adding new stock-count-style routes, register both `/stock/x` and `/stock-x` variants, or update the OpenAPI spec and regenerate to align.
