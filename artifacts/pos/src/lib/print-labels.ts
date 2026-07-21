import JsBarcode from "jsbarcode";
import { FONT_IMPORT } from "./print-document";

export interface LabelItem {
  /** The value encoded in the bars and shown as the number underneath. */
  barcode: string;
  /** Product name (Arabic), printed under the shop name. */
  name?: string;
  /** Our internal code (SKU), printed under the number. */
  sku: string;
  /** How many stickers to print for this product (= its quantity). */
  copies: number;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

// Render one barcode value to a standalone, scalable SVG string.
function barcodeSvg(value: string): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: "CODE128",
      // Wider bars so the barcode fills the label width (no empty side bands) while
      // its aspect ratio stays scannable when scaled into the sticker.
      width: 3,
      // Taller bars + bigger number so the barcode block fills the label instead of
      // floating as a small design inside wide empty margins.
      height: 44,
      displayValue: true,
      // Bold, heavy digits so the number under the bars prints crisp (not thin/broken)
      // on the shop's low‑dpi label printer.
      font: "'Cairo','Tajawal',sans-serif",
      fontOptions: "bold",
      fontSize: 17,
      textMargin: 1,
      margin: 0,
    });
  } catch {
    return "";
  }
  // Replace the fixed width/height JsBarcode sets with a viewBox so the sticker
  // CSS can scale it to the label while preserving the bars' aspect ratio.
  const w = svg.getAttribute("width");
  const h = svg.getAttribute("height");
  if (w && h) {
    svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
  }
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Prints barcode stickers on a label-roll printer: each sticker is its own
 * 4cm × 1.5cm page. Stickers are grouped product-by-product in order (copies =
 * quantity), with one blank sticker between products to separate them.
 *
 * Opens a dedicated print window so it never collides with the app's A4 invoice
 * print rules. Returns false if the browser blocked the popup.
 *
 * Each sticker shows, top to bottom: shop name, product name, then the barcode (with
 * its number underneath). `shopName` (from settings) is the same on every sticker; the
 * product name comes from each item. (The internal SKU is intentionally not printed.)
 */
export function printLabels(items: LabelItem[], shopName?: string): boolean {
  const printable = items.filter((i) => i.barcode && Math.round(i.copies) >= 1);
  if (printable.length === 0) return true;

  const shopLine = shopName && shopName.trim()
    ? `<div class="shop">${escapeHtml(shopName.trim())}</div>`
    : "";

  const labels: string[] = [];
  printable.forEach((it, idx) => {
    const copies = Math.max(1, Math.round(it.copies));
    const svg = barcodeSvg(it.barcode);
    const nameLine = it.name && it.name.trim()
      ? `<div class="name">${escapeHtml(it.name.trim())}</div>`
      : "";
    for (let i = 0; i < copies; i++) {
      labels.push(
        `<div class="label">${shopLine}${nameLine}<div class="bc">${svg}</div></div>`,
      );
    }
    // Blank separator sticker between products (not after the last one).
    if (idx < printable.length - 1) labels.push(`<div class="label blank"></div>`);
  });

  const win = window.open("", "_blank", "width=420,height=640");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html dir="rtl"><head><meta charset="utf-8"><title>طباعة الباركود</title>
<style>
  ${FONT_IMPORT}
  @page { size: 40mm 15mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* Label text uses Cairo/Tajawal directly (not SF Arabic, which is absent on the
     shop's Windows PC and falls back to a thin face that prints broken). */
  body { width: 40mm; font-family: 'Cairo','Tajawal','Segoe UI',sans-serif; }
  .label {
    /* Tight ~0.8mm margins so the design fills the whole sticker instead of floating
       inside wide empty bands; content spreads over the full height (space-between). */
    width: 40mm; height: 15mm; padding: 0.8mm;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    overflow: hidden; text-align: center; page-break-after: always; break-after: page;
  }
  .label:last-of-type { page-break-after: auto; break-after: auto; }
  /* Roomy line-height so Arabic descenders (ص/ط/ع tails) are never clipped by the
     overflow:hidden that provides the horizontal ellipsis — Cairo's glyph box is
     tall, so 1.1 cut the bottoms off. The taller line box also adds visual spacing. */
  .shop { font-size: 5pt; font-weight: 800; line-height: 1.5; max-width: 100%;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-size: 5.5pt; font-weight: 800; line-height: 1.5; max-width: 100%;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bc { width: 100%; height: 8mm; display: flex; align-items: center; justify-content: center; }
  .bc svg { max-width: 100%; max-height: 100%; }
  .blank { }
</style>
<script>window.onafterprint=function(){setTimeout(function(){window.close();},150);};</script>
</head>
<body onload="window.focus();window.print();">
${labels.join("\n")}
</body></html>`);
  win.document.close();
  return true;
}
