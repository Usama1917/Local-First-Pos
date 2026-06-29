import JsBarcode from "jsbarcode";

export interface LabelItem {
  /** The value encoded in the bars and shown as the number underneath. */
  barcode: string;
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
      width: 1.5,
      height: 34,
      displayValue: true,
      fontSize: 13,
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
 */
export function printLabels(items: LabelItem[]): boolean {
  const printable = items.filter((i) => i.barcode && Math.round(i.copies) >= 1);
  if (printable.length === 0) return true;

  const labels: string[] = [];
  printable.forEach((it, idx) => {
    const copies = Math.max(1, Math.round(it.copies));
    const svg = barcodeSvg(it.barcode);
    for (let i = 0; i < copies; i++) {
      labels.push(
        `<div class="label"><div class="bc">${svg}</div><div class="sku">${escapeHtml(it.sku)}</div></div>`,
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
  @page { size: 40mm 15mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { width: 40mm; font-family: sans-serif; }
  .label {
    width: 40mm; height: 15mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.3mm; overflow: hidden; page-break-after: always; break-after: page;
  }
  .label:last-of-type { page-break-after: auto; break-after: auto; }
  .bc { width: 38mm; height: 10.5mm; display: flex; align-items: center; justify-content: center; }
  .bc svg { width: 100%; height: 100%; }
  .sku { font-family: monospace; font-size: 7.5pt; font-weight: 700; line-height: 1; }
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
