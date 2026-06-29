import { formatCurrency } from "./format";

export interface ReturnReceiptItem {
  kind: "returned" | "new" | string;
  productName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
  restock?: number;
}

export interface ShopInfo {
  shopName?: string | null;
  shopAddress?: string | null;
  shopPhone?: string | null;
}

export interface ReturnReceiptData {
  serial: string;
  originalSerial?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  type: "return" | "exchange" | string;
  settlementType?: "cash" | "account" | string;
  returnedTotal: number;
  newItemsTotal: number;
  netAmount: number;
  notes?: string | null;
  createdAt?: string;
  items: ReturnReceiptItem[];
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG"); } catch { return "—"; }
}

function rows(items: ReturnReceiptItem[], kind: string, showRestock: boolean): string {
  const list = items.filter((i) => i.kind === kind);
  if (!list.length) return "";
  return list
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(it.productName || "")}${it.sku ? ` <span class="sku">(${escapeHtml(it.sku)})</span>` : ""}</td>
        <td class="c">${it.quantity}</td>
        <td class="l">${formatCurrency(it.unitPrice || 0)}</td>
        <td class="l b">${formatCurrency(it.total || 0)}</td>
        ${showRestock ? `<td class="c">${it.restock ? "سليم ↺" : "تالف"}</td>` : ""}
      </tr>`,
    )
    .join("");
}

/**
 * A4 receipt for a return / exchange: the original invoice, the returned lines
 * (with restock status), any new exchange lines, and the net the customer owes
 * or is refunded. Returns false if the browser blocked the popup.
 */
export function printReturnReceipt(r: ReturnReceiptData, shop: ShopInfo = {}): boolean {
  const isExchange = r.type === "exchange" || (r.items || []).some((i) => i.kind === "new");
  const shopName = shop.shopName || "المحل";
  const shopMeta = [shop.shopAddress, shop.shopPhone ? `☎ ${shop.shopPhone}` : ""].filter(Boolean).join(" · ");
  const title = isExchange ? "إيصال استبدال" : "إيصال مرتجع";
  const net = r.netAmount || 0;
  const netLabel = net > 0 ? "مطلوب من العميل" : net < 0 ? "مسترد للعميل" : "لا فرق";
  const settle = r.settlementType === "account" ? "على حساب العميل (مديونية)" : "كاش";

  const returnedRows = rows(r.items || [], "returned", true);
  const newRows = rows(r.items || [], "new", false);

  const win = window.open("", "_blank", "width=820,height=920");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title} ${escapeHtml(r.serial)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #111; margin: 0; }
  .shop { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .shop .name { font-size: 20pt; font-weight: 800; }
  .shop .meta { font-size: 10pt; color: #444; margin-top: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
  .head h1 { font-size: 18pt; margin: 0 0 4px; }
  .head .serial { font-family: monospace; font-size: 11pt; color: #444; }
  .info { margin: 12px 0; font-size: 11pt; line-height: 1.7; display: flex; flex-wrap: wrap; gap: 4px 24px; }
  .info b { color: #444; }
  h2 { font-size: 12pt; margin: 14px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: right; }
  th { background: #f1f5f9; font-weight: 700; }
  td.l, th.l { text-align: left; }
  td.c, th.c { text-align: center; }
  td.b { font-weight: 700; }
  .sku { color: #888; font-size: 9pt; }
  .totals { margin-top: 14px; margin-inline-start: auto; width: 320px; font-size: 11pt; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .net { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-size: 14pt; font-weight: 700; }
  .notes { margin-top: 12px; font-size: 10.5pt; color: #444; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11pt; }
  .sign div { border-top: 1px solid #111; padding-top: 6px; width: 40%; text-align: center; }
</style>
<script>window.onafterprint=function(){setTimeout(function(){window.close();},150);};</script>
</head>
<body onload="window.focus();window.print();">
  <div class="shop">
    <div class="name">${escapeHtml(shopName)}</div>
    ${shopMeta ? `<div class="meta">${escapeHtml(shopMeta)}</div>` : ""}
  </div>
  <div class="head">
    <div>
      <h1>${title}</h1>
      <div class="serial">${escapeHtml(r.serial)}</div>
    </div>
    <div style="text-align:left">التاريخ: ${fmtDate(r.createdAt)}</div>
  </div>

  <div class="info">
    ${r.originalSerial ? `<span><b>الفاتورة الأصلية:</b> ${escapeHtml(r.originalSerial)}</span>` : ""}
    <span><b>العميل:</b> ${escapeHtml(r.customerName || "نقدي")}</span>
    ${r.customerPhone ? `<span><b>الهاتف:</b> ${escapeHtml(r.customerPhone)}</span>` : ""}
    <span><b>طريقة التسوية:</b> ${settle}</span>
  </div>

  ${
    returnedRows
      ? `<h2>الأصناف المرتجعة</h2>
  <table>
    <thead><tr><th class="c">#</th><th>الصنف</th><th class="c">الكمية</th><th class="l">سعر الوحدة</th><th class="l">الإجمالي</th><th class="c">الحالة</th></tr></thead>
    <tbody>${returnedRows}</tbody>
  </table>`
      : ""
  }

  ${
    newRows
      ? `<h2>الأصناف البديلة (الجديدة)</h2>
  <table>
    <thead><tr><th class="c">#</th><th>الصنف</th><th class="c">الكمية</th><th class="l">سعر الوحدة</th><th class="l">الإجمالي</th></tr></thead>
    <tbody>${newRows}</tbody>
  </table>`
      : ""
  }

  <div class="totals">
    <div><span>إجمالي المرتجع</span><span>${formatCurrency(r.returnedTotal || 0)}</span></div>
    ${isExchange ? `<div><span>إجمالي البديل</span><span>${formatCurrency(r.newItemsTotal || 0)}</span></div>` : ""}
    <div class="net"><span>${netLabel}</span><span>${formatCurrency(Math.abs(net))}</span></div>
  </div>

  ${r.notes ? `<div class="notes"><b>ملاحظات:</b> ${escapeHtml(r.notes)}</div>` : ""}

  <div class="sign">
    <div>توقيع العميل</div>
    <div>توقيع المحل</div>
  </div>
</body></html>`);
  win.document.close();
  return true;
}
