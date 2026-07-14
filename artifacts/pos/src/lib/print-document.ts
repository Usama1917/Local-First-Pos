// Shared print infrastructure for every printable *document* (sales invoice,
// return/exchange receipt, commission payout receipt …). Product barcode stickers
// are a different physical medium and keep their own helper (`print-labels.ts`).
//
// We print into a dedicated, isolated popup window (not the app's own document via
// `window.print()`, which is fragile — the Radix dialog clipped the top of the page).
// The window is a clean, self-contained HTML document whose `@page` size + base
// typography come from the chosen format, so the *same* body markup renders correctly
// as A4, A5, or an 80mm thermal receipt.

export type PrintFormat = "a4" | "a5" | "thermal";

export const PRINT_FORMATS: { key: PrintFormat; label: string }[] = [
  { key: "a4", label: "A4" },
  { key: "a5", label: "A5" },
  { key: "thermal", label: "حراري" },
];

/** Normalize whatever is stored in settings (or undefined) to a valid format. */
export function normalizeFormat(v: unknown): PrintFormat {
  return v === "a5" || v === "thermal" ? v : "a4";
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG"); } catch { return "—"; }
}

// Match the app's own font (see `--app-font-sans` in index.css) so printed
// documents look identical to the on-screen app. The @import loads Cairo/Tajawal
// (the app's web fonts) into the isolated print window; it falls back to the
// system Arabic font exactly like the app does when offline.
export const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Tajawal:wght@400;500;700;800&display=swap');";
export const APP_FONT =
  "'SF Arabic','SF Pro Text','SF Pro Display',-apple-system,BlinkMacSystemFont,'Cairo','Tajawal','Segoe UI',sans-serif";

const PAGE: Record<PrintFormat, string> = {
  a4: "@page { size: A4; margin: 14mm; }",
  a5: "@page { size: A5; margin: 10mm; }",
  // 80mm roll; height grows with content. No @page margin — horizontal spacing is
  // done with body padding instead, so right-aligned Arabic never reaches the paper's
  // unprintable edge (which was clipping the start of each line).
  thermal: "@page { size: 80mm auto; margin: 0; }",
};

/**
 * The shared stylesheet. Class names are deliberately the same across all document
 * builders (`.shop`, `.head`, `.info`, `table`, `.totals`, `.sign` …) so one set of
 * rules styles every receipt. Format differences are driven by the `body.fmt-*` class.
 */
function baseCss(format: PrintFormat): string {
  // @import must come first in the stylesheet, before @page/any rule.
  return `${FONT_IMPORT}
  ${PAGE[format]}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; }
  body { font-family: ${APP_FONT}; color: #111; direction: rtl; }
  body.fmt-a4 { font-size: 11pt; }
  body.fmt-a5 { font-size: 9.5pt; }
  /* Thermal print area is a fixed 60mm column on the 80mm roll, independent of the
     printer/dialog — so nothing ever clips. Nudged toward the left (15mm right / 5mm
     left padding) to counter this thermal head's right-bias so it looks centered.
     Heavy weight (Cairo 700+) because thin strokes fade on a low-dpi thermal head. */
  body.fmt-thermal { font-family: 'Cairo','Tajawal','Segoe UI',sans-serif; font-weight: 700;
                     font-size: 8.5pt; width: 80mm; padding: 3mm 15mm 6mm 5mm; margin: 0 auto; }

  .shop { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .shop .name { font-weight: 800; font-size: 1.8em; line-height: 1.2; }
  .shop .meta { color: #444; font-size: 0.85em; margin-top: 2px; }

  .barcode { text-align: center; margin: 6px 0 10px; }
  .barcode img { max-width: 100%; height: auto; }

  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
          border-bottom: 1px solid #ccc; padding-bottom: 8px; }
  .head h1 { font-size: 1.5em; margin: 0 0 4px; }
  .head .serial { font-family: monospace; color: #444; }

  .info { display: flex; flex-wrap: wrap; gap: 4px 24px; line-height: 1.7; margin: 12px 0; }
  .info div { white-space: nowrap; }
  .info b { color: #444; font-weight: 600; }

  h2 { font-size: 1.05em; margin: 14px 0 4px; }

  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: right; }
  th { background: #f1f5f9; font-weight: 700; }
  td.l, th.l { text-align: left; }
  td.c, th.c { text-align: center; }
  td.b { font-weight: 700; }
  td.mono { font-family: monospace; }
  .sku { color: #888; font-size: 0.82em; }

  .totals { margin-top: 14px; margin-inline-start: auto; width: 320px; max-width: 100%; }
  .totals > div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .muted { color: #555; }
  .totals .pos { color: #047857; }
  .totals .neg { color: #b91c1c; font-weight: 600; }
  .totals .net { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-size: 1.25em; font-weight: 800; }

  .total-box { margin-top: 14px; display: flex; justify-content: space-between; align-items: center;
               border: 2px solid #111; border-radius: 6px; padding: 10px 14px; font-size: 1.25em; font-weight: 700; }

  .notes { margin-top: 12px; color: #444; font-size: 0.9em; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; gap: 24px; }
  .sign div { border-top: 1px solid #111; padding-top: 6px; width: 45%; text-align: center; }
  .footer { margin-top: 18px; text-align: center; color: #666; font-size: 0.85em; }

  /* Thermal (80mm roll): single narrow column, tighter, no signature lines.
     Everything bold + pure black so it prints crisp; no thin/gray text (it fades). */
  body.fmt-thermal .shop .name { font-size: 1.4em; font-weight: 800; }
  body.fmt-thermal .head { flex-direction: column; gap: 2px; }
  body.fmt-thermal .head h1 { font-weight: 800; }
  body.fmt-thermal .info { flex-direction: column; gap: 2px; }
  body.fmt-thermal h2 { font-weight: 800; }
  body.fmt-thermal table { font-size: 0.85em; margin-top: 6px; }
  body.fmt-thermal th, body.fmt-thermal td { padding: 2px 3px; font-weight: 700; }
  body.fmt-thermal .totals { width: 100%; }
  body.fmt-thermal .totals .net { font-weight: 800; }
  body.fmt-thermal .sign { display: none; }
  /* Kill faded grays on thermal — force strong ink everywhere. */
  body.fmt-thermal, body.fmt-thermal .shop .meta, body.fmt-thermal .info b,
  body.fmt-thermal .head .serial, body.fmt-thermal .sku, body.fmt-thermal .totals .muted,
  body.fmt-thermal .footer, body.fmt-thermal .notes { color: #000; }
  `;
}

/** A shop-header block reused by every document. */
export function shopHeaderHtml(shop: { shopName?: string | null; shopAddress?: string | null; shopPhone?: string | null } = {}): string {
  const name = shop.shopName || "المحل";
  const meta = [shop.shopAddress, shop.shopPhone ? `☎ ${shop.shopPhone}` : ""].filter(Boolean).join(" · ");
  return `<div class="shop"><div class="name">${escapeHtml(name)}</div>${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ""}</div>`;
}

/**
 * Open an isolated print window for a document and trigger the print dialog.
 * Returns false if the browser blocked the popup (caller should toast the user).
 */
export function printHtml(opts: { title: string; bodyHtml: string; format: PrintFormat; extraCss?: string }): boolean {
  const { title, bodyHtml, format, extraCss = "" } = opts;
  const win = window.open("", "_blank", "width=860,height=940");
  if (!win) return false;
  win.document.write(`<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${baseCss(format)}${extraCss}</style>
<script>window.onafterprint=function(){setTimeout(function(){window.close();},150);};</script>
</head>
<body class="fmt-${format}" onload="window.focus();window.print();">
${bodyHtml}
</body></html>`);
  win.document.close();
  return true;
}
