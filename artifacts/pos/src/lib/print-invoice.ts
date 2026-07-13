import JsBarcode from "jsbarcode";
import { formatCurrency } from "./format";
import { PrintFormat, printHtml, shopHeaderHtml, escapeHtml, fmtDate } from "./print-document";

export interface ShopInfo {
  shopName?: string | null;
  shopAddress?: string | null;
  shopPhone?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "نقدي",
  credit: "آجل",
  partial: "دفعة جزئية",
};

/** Render a CODE128 barcode of the serial to a PNG data URL for embedding in the print window. */
function barcodeDataUrl(value: string): string {
  if (!value) return "";
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, { format: "CODE128", width: 1.6, height: 44, displayValue: true, fontSize: 13, margin: 0 });
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Print a sales invoice in the chosen paper format (A4 / A5 / thermal). Returns false
 * if the popup was blocked. The layout, totals, and signatures match the on-screen
 * invoice; thermal drops the signature lines and prints as a single narrow column.
 */
export function printInvoice(inv: any, shop: ShopInfo = {}, format: PrintFormat = "a4"): boolean {
  const items: any[] = inv?.items || [];
  const grossSubtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemsDiscount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const totalDiscount = itemsDiscount + (inv?.discount || 0);
  const barcode = barcodeDataUrl(inv?.serial || "");

  const rows = items.length
    ? items
        .map(
          (item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(item.productName)}${item.sku ? ` <span class="sku">(${escapeHtml(item.sku)})</span>` : ""}</td>
        <td class="c">${item.quantity}${item.unitName ? ` ${escapeHtml(item.unitName)}` : ""}</td>
        <td class="l">${formatCurrency(item.unitPrice)}</td>
        <td class="l">${item.discount ? formatCurrency(item.discount) : "—"}</td>
        <td class="l b">${formatCurrency(item.total)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="6" class="c">لا توجد أصناف</td></tr>`;

  const body = `
  ${shopHeaderHtml(shop)}
  ${barcode ? `<div class="barcode"><img src="${barcode}" alt="${escapeHtml(inv.serial)}" /></div>` : ""}
  <div class="head">
    <div>
      <h1>فاتورة مبيعات</h1>
      <div class="serial">${escapeHtml(inv?.serial || "")}</div>
    </div>
    <div style="text-align:left">التاريخ: ${fmtDate(inv?.createdAt)}</div>
  </div>

  <div class="info">
    <div><b>العميل:</b> ${escapeHtml(inv?.customerName || "عميل نقدي")}</div>
    ${inv?.craftsmanName ? `<div><b>الصنايعي / الفني:</b> ${escapeHtml(inv.craftsmanName)}</div>` : ""}
    <div><b>طريقة الدفع:</b> ${escapeHtml(PAYMENT_LABELS[inv?.paymentType] || inv?.paymentType || "—")}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>المنتج</th>
        <th class="c">الكمية</th>
        <th class="l">السعر</th>
        <th class="l">الخصم</th>
        <th class="l">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div class="muted"><span>الإجمالي الفرعي:</span><span>${formatCurrency(grossSubtotal)}</span></div>
    ${totalDiscount > 0 ? `<div class="neg"><span>إجمالي الخصم:</span><span>- ${formatCurrency(totalDiscount)}</span></div>` : ""}
    <div class="net"><span>الإجمالي:</span><span>${formatCurrency(inv?.total || 0)}</span></div>
    ${inv?.paidAmount > 0 ? `<div class="pos"><span>المدفوع:</span><span>${formatCurrency(inv.paidAmount)}</span></div>` : ""}
    ${inv?.remainingAmount > 0 ? `<div class="neg"><span>المتبقي (على العميل):</span><span>${formatCurrency(inv.remainingAmount)}</span></div>` : ""}
  </div>

  ${inv?.notes ? `<div class="notes"><b>ملاحظات:</b> ${escapeHtml(inv.notes)}</div>` : ""}

  <div class="sign">
    <div>توقيع صاحب المحل</div>
    <div>توقيع ${inv?.craftsmanName ? "العميل / الصنايعي" : "العميل"}</div>
  </div>

  <div class="footer">شكراً لتعاملكم معنا${shop?.shopPhone ? ` — للاستفسار: ${escapeHtml(shop.shopPhone)}` : ""}</div>
  `;

  return printHtml({ title: `فاتورة ${inv?.serial || ""}`, bodyHtml: body, format });
}
