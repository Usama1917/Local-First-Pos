import { formatCurrency } from "./format";
import { PrintFormat, printHtml, shopHeaderHtml, escapeHtml, fmtDate, cellMoney, colGroup } from "./print-document";

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

/**
 * Craftsman commission-payout receipt in the chosen paper format (A4 / A5 / thermal):
 * the craftsman's details, every invoice that contributed to the payout (with its own
 * total + commission), and the amount drawn against each. Returns false if the popup
 * was blocked.
 */
export function printCommissionReceipt(r: CommissionReceipt, shop: ShopInfo = {}, format: PrintFormat = "a4"): boolean {
  const rows = (r.items || [])
    .map(
      (it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td class="mono">${escapeHtml(it.serial)}</td>
        <td>${escapeHtml(it.customerName || "نقدي")}</td>
        <td class="c">${fmtDate(it.createdAt)}</td>
        <td class="l">${cellMoney(it.invoiceTotal || 0, format)}</td>
        <td class="l">${cellMoney(it.invoiceCommission || 0, format)}</td>
        <td class="l b">${cellMoney(it.amount || 0, format)}</td>
      </tr>`,
    )
    .join("");

  const body = `
  ${shopHeaderHtml(shop)}
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
    ${colGroup([5, 17, 17, 13, 16, 16, 16])}
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

  <div class="total-box">
    <span>إجمالي المبلغ المسحوب</span>
    <span>${formatCurrency(r.amount || 0)}</span>
  </div>

  ${r.notes ? `<div class="notes"><b>ملاحظات:</b> ${escapeHtml(r.notes)}</div>` : ""}

  <div class="sign">
    <div>توقيع الصنايعي (المستلم)</div>
    <div>توقيع المحل</div>
  </div>
  `;

  return printHtml({ title: `إيصال سحب عمولة ${r.serial}`, bodyHtml: body, format });
}
