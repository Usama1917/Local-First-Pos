import { formatCurrency } from "./format";
import { PrintFormat, printHtml, shopHeaderHtml, escapeHtml, fmtDate } from "./print-document";

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
 * Receipt for a return / exchange in the chosen paper format (A4 / A5 / thermal):
 * the original invoice, the returned lines (with restock status), any new exchange
 * lines, and the net the customer owes or is refunded. Returns false if the popup
 * was blocked.
 */
export function printReturnReceipt(r: ReturnReceiptData, shop: ShopInfo = {}, format: PrintFormat = "a4"): boolean {
  const isExchange = r.type === "exchange" || (r.items || []).some((i) => i.kind === "new");
  const title = isExchange ? "إيصال استبدال" : "إيصال مرتجع";
  const net = r.netAmount || 0;
  const netLabel = net > 0 ? "مطلوب من العميل" : net < 0 ? "مسترد للعميل" : "لا فرق";
  const settle = r.settlementType === "account" ? "على حساب العميل (مديونية)" : "كاش";

  const returnedRows = rows(r.items || [], "returned", true);
  const newRows = rows(r.items || [], "new", false);

  const body = `
  ${shopHeaderHtml(shop)}
  <div class="head">
    <div>
      <h1>${title}</h1>
      <div class="serial">${escapeHtml(r.serial)}</div>
    </div>
    <div style="text-align:left">التاريخ: ${fmtDate(r.createdAt)}</div>
  </div>

  <div class="info">
    ${r.originalSerial ? `<div><b>الفاتورة الأصلية:</b> ${escapeHtml(r.originalSerial)}</div>` : ""}
    <div><b>العميل:</b> ${escapeHtml(r.customerName || "نقدي")}</div>
    ${r.customerPhone ? `<div><b>الهاتف:</b> ${escapeHtml(r.customerPhone)}</div>` : ""}
    <div><b>طريقة التسوية:</b> ${settle}</div>
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
    <div class="muted"><span>إجمالي المرتجع</span><span>${formatCurrency(r.returnedTotal || 0)}</span></div>
    ${isExchange ? `<div class="muted"><span>إجمالي البديل</span><span>${formatCurrency(r.newItemsTotal || 0)}</span></div>` : ""}
    <div class="net"><span>${netLabel}</span><span>${formatCurrency(Math.abs(net))}</span></div>
  </div>

  ${r.notes ? `<div class="notes"><b>ملاحظات:</b> ${escapeHtml(r.notes)}</div>` : ""}

  <div class="sign">
    <div>توقيع العميل</div>
    <div>توقيع المحل</div>
  </div>
  `;

  return printHtml({ title: `${title} ${r.serial}`, bodyHtml: body, format });
}
