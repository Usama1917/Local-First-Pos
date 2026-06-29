import { formatCurrency } from "./format";

export interface CommissionReceiptItem {
  serial: string;
  customerName?: string | null;
  invoiceTotal?: number;
  invoiceCommission?: number;
  amount: number;
  createdAt?: string;
}

export interface ShopInfo {
  shopName?: string | null;
  shopAddress?: string | null;
  shopPhone?: string | null;
}

export interface CommissionReceipt {
  serial: string;
  craftsmanName?: string | null;
  craftsmanPhone?: string | null;
  craftsmanJobType?: string | null;
  commissionPercent?: number | null;
  amount: number;
  notes?: string | null;
  createdAt?: string;
  items: CommissionReceiptItem[];
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}

function fmtDate(d?: string): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("ar-EG");
  } catch {
    return "—";
  }
}

/**
 * Opens a dedicated A4 print window with a craftsman commission-payout receipt:
 * the craftsman's details, every invoice that contributed to the payout (with its
 * own total + commission), and the amount drawn against each. Returns false if the
 * browser blocked the popup.
 */
export function printCommissionReceipt(r: CommissionReceipt, shop: ShopInfo = {}): boolean {
  const shopName = shop.shopName || "المحل";
  const shopMeta = [shop.shopAddress, shop.shopPhone ? `☎ ${shop.shopPhone}` : ""].filter(Boolean).join(" · ");
  const rows = (r.items || [])
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mono">${escapeHtml(it.serial)}</td>
        <td>${escapeHtml(it.customerName || "نقدي")}</td>
        <td class="c">${fmtDate(it.createdAt)}</td>
        <td class="l">${formatCurrency(it.invoiceTotal || 0)}</td>
        <td class="l">${formatCurrency(it.invoiceCommission || 0)}</td>
        <td class="l b">${formatCurrency(it.amount || 0)}</td>
      </tr>`,
    )
    .join("");

  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>إيصال سحب عمولة ${escapeHtml(r.serial)}</title>
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
  .info { margin: 12px 0; font-size: 11pt; line-height: 1.7; }
  .info b { display: inline-block; min-width: 90px; color: #444; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; margin-top: 6px; }
  th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: right; }
  th { background: #f1f5f9; font-weight: 700; }
  td.l, th.l { text-align: left; }
  td.c, th.c { text-align: center; }
  td.mono { font-family: monospace; }
  td.b { font-weight: 700; }
  tfoot td { font-size: 12pt; font-weight: 700; background: #f8fafc; }
  .total { margin-top: 14px; display: flex; justify-content: space-between; align-items: center;
           border: 2px solid #111; border-radius: 6px; padding: 10px 14px; font-size: 14pt; font-weight: 700; }
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
      <h1>إيصال سحب عمولة</h1>
      <div class="serial">${escapeHtml(r.serial)}</div>
    </div>
    <div style="text-align:left">التاريخ: ${fmtDate(r.createdAt)}</div>
  </div>

  <div class="info">
    <div><b>الصنايعي:</b> ${escapeHtml(r.craftsmanName || "—")}</div>
    ${r.craftsmanJobType ? `<div><b>التخصص:</b> ${escapeHtml(r.craftsmanJobType)}</div>` : ""}
    ${r.craftsmanPhone ? `<div><b>الهاتف:</b> ${escapeHtml(r.craftsmanPhone)}</div>` : ""}
    ${r.commissionPercent != null ? `<div><b>نسبة العمولة:</b> ${r.commissionPercent}%</div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th class="c">#</th>
        <th>الفاتورة</th>
        <th>العميل</th>
        <th class="c">التاريخ</th>
        <th class="l">إجمالي الفاتورة</th>
        <th class="l">عمولة الفاتورة</th>
        <th class="l">المسحوب منها</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="7" class="c">لا توجد فواتير</td></tr>`}</tbody>
  </table>

  <div class="total">
    <span>إجمالي المبلغ المسحوب</span>
    <span>${formatCurrency(r.amount || 0)}</span>
  </div>

  ${r.notes ? `<div class="notes"><b>ملاحظات:</b> ${escapeHtml(r.notes)}</div>` : ""}

  <div class="sign">
    <div>توقيع الصنايعي (المستلم)</div>
    <div>توقيع المحل</div>
  </div>
</body></html>`);
  win.document.close();
  return true;
}
