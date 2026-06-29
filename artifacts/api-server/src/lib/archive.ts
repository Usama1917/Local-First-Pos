import path from "path";
import db from "./db.js";
import { getSettings } from "./db.js";
import { getArchiveDir } from "./paths.js";
import { htmlToPdf, browserAvailable } from "./pdf.js";

// ── helpers ──────────────────────────────────────────────────────────────
function esc(s: any): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
  );
}
function money(n: any): string {
  return `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}
function fdate(d: any): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("ar-EG"); } catch { return String(d); }
}
// Make a string safe to use as a Windows/macOS folder or file name.
function safeName(s: any, fallback = "غير محدد"): string {
  const cleaned = String(s ?? "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 80);
}

function docShell(title: string, metaRows: string[], body: string): string {
  const s = getSettings() || {};
  const shopName = esc(s.shopName || "المحل");
  const shopMeta = [s.shopAddress, s.shopPhone ? `☎ ${s.shopPhone}` : ""].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Segoe UI", Tahoma, "Cairo", sans-serif; color: #111; margin: 0; }
  .shop { text-align: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
  .shop .name { font-size: 20pt; font-weight: 800; }
  .shop .meta { font-size: 10pt; color: #444; margin-top: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #ccc; padding-bottom: 8px; }
  .head h1 { font-size: 17pt; margin: 0; }
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
  .totals .grand { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; font-size: 14pt; font-weight: 700; }
  .sign { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11pt; }
  .sign div { border-top: 1px solid #111; padding-top: 6px; width: 40%; text-align: center; }
</style></head><body>
  <div class="shop"><div class="name">${shopName}</div>${shopMeta ? `<div class="meta">${shopMeta}</div>` : ""}</div>
  <div class="head"><h1>${esc(title)}</h1></div>
  <div class="info">${metaRows.filter(Boolean).join("")}</div>
  ${body}
</body></html>`;
}

// ── HTML builders ────────────────────────────────────────────────────────
function salesHtml(inv: any, items: any[]): string {
  const rows = items.map((it, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(it.productName)}${it.sku ? ` <span class="sku">(${esc(it.sku)})</span>` : ""}</td>
    <td class="c">${it.quantity}</td>
    <td class="l">${money(it.unitPrice)}</td>
    <td class="l b">${money(it.total)}</td></tr>`).join("");
  const body = `
    <table><thead><tr><th class="c">#</th><th>الصنف</th><th class="c">الكمية</th><th class="l">سعر الوحدة</th><th class="l">الإجمالي</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="c">لا أصناف</td></tr>`}</tbody></table>
    <div class="totals">
      <div><span>الإجمالي الفرعي</span><span>${money(inv.subtotal)}</span></div>
      ${inv.discount ? `<div><span>الخصم</span><span>${money(inv.discount)}</span></div>` : ""}
      <div class="grand"><span>الإجمالي</span><span>${money(inv.total)}</span></div>
      <div><span>المدفوع</span><span>${money(inv.paidAmount)}</span></div>
      <div><span>المتبقي</span><span>${money(inv.remainingAmount)}</span></div>
    </div>
    <div class="sign"><div>توقيع العميل</div><div>توقيع المحل</div></div>`;
  return docShell(`فاتورة مبيعات ${inv.serial}`, [
    `<span><b>رقم الفاتورة:</b> ${esc(inv.serial)}</span>`,
    `<span><b>التاريخ:</b> ${fdate(inv.createdAt)}</span>`,
    `<span><b>العميل:</b> ${esc(inv.customerName || "نقدي")}</span>`,
    inv.craftsmanName ? `<span><b>الصنايعي:</b> ${esc(inv.craftsmanName)}</span>` : "",
  ], body);
}

function purchaseHtml(pur: any, items: any[]): string {
  const rows = items.map((it, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(it.productName)}${it.sku ? ` <span class="sku">(${esc(it.sku)})</span>` : ""}</td>
    <td class="c">${it.quantity}</td>
    <td class="l">${money(it.listPrice)}</td>
    <td class="c">${it.supplierDiscount || 0}%</td>
    <td class="l">${money(it.netPrice)}</td>
    <td class="l b">${money(it.total)}</td></tr>`).join("");
  const body = `
    <table><thead><tr><th class="c">#</th><th>الصنف</th><th class="c">الكمية</th><th class="l">سعر القائمة</th><th class="c">خصم</th><th class="l">صافي</th><th class="l">الإجمالي</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="c">لا أصناف</td></tr>`}</tbody></table>
    <div class="totals">
      <div class="grand"><span>الإجمالي</span><span>${money(pur.total)}</span></div>
      <div><span>المدفوع</span><span>${money(pur.paidAmount)}</span></div>
      <div><span>المتبقي</span><span>${money(pur.remainingAmount)}</span></div>
    </div>`;
  return docShell(`فاتورة مشتريات ${pur.serial}`, [
    `<span><b>رقم الفاتورة:</b> ${esc(pur.serial)}</span>`,
    `<span><b>التاريخ:</b> ${fdate(pur.invoiceDate || pur.createdAt)}</span>`,
    `<span><b>المورد:</b> ${esc(pur.supplierName || "—")}</span>`,
  ], body);
}

function returnHtml(ret: any, items: any[]): string {
  const isExchange = ret.type === "exchange";
  const sec = (kind: string, showState: boolean) => {
    const list = items.filter((i) => i.kind === kind);
    if (!list.length) return "";
    const rows = list.map((it, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(it.productName)}</td>
      <td class="c">${it.quantity}</td>
      <td class="l">${money(it.unitPrice)}</td>
      <td class="l b">${money(it.total)}</td>
      ${showState ? `<td class="c">${it.restock ? "سليم ↺" : "تالف"}</td>` : ""}</tr>`).join("");
    return `<h2>${kind === "returned" ? "الأصناف المرتجعة" : "الأصناف البديلة"}</h2>
      <table><thead><tr><th class="c">#</th><th>الصنف</th><th class="c">الكمية</th><th class="l">سعر الوحدة</th><th class="l">الإجمالي</th>${showState ? "<th class=\"c\">الحالة</th>" : ""}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  };
  const net = ret.netAmount || 0;
  const netLabel = net > 0 ? "مطلوب من العميل" : net < 0 ? "مسترد للعميل" : "لا فرق";
  const body = `${sec("returned", true)}${sec("new", false)}
    <div class="totals">
      <div><span>إجمالي المرتجع</span><span>${money(ret.returnedTotal)}</span></div>
      ${isExchange ? `<div><span>إجمالي البديل</span><span>${money(ret.newItemsTotal)}</span></div>` : ""}
      <div class="grand"><span>${netLabel}</span><span>${money(Math.abs(net))}</span></div>
    </div>
    <div class="sign"><div>توقيع العميل</div><div>توقيع المحل</div></div>`;
  return docShell(`${isExchange ? "إيصال استبدال" : "إيصال مرتجع"} ${ret.serial}`, [
    `<span><b>رقم الإيصال:</b> ${esc(ret.serial)}</span>`,
    `<span><b>التاريخ:</b> ${fdate(ret.createdAt)}</span>`,
    ret.originalSerial ? `<span><b>الفاتورة الأصلية:</b> ${esc(ret.originalSerial)}</span>` : "",
    `<span><b>العميل:</b> ${esc(ret.customerName || "نقدي")}</span>`,
    `<span><b>التسوية:</b> ${ret.settlementType === "account" ? "على الحساب" : "كاش"}</span>`,
  ], body);
}

function payoutHtml(p: any, items: any[]): string {
  const rows = items.map((it, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${esc(it.serial)}</td>
    <td>${esc(it.customerName || "نقدي")}</td>
    <td class="c">${fdate(it.createdAt)}</td>
    <td class="l">${money(it.invoiceTotal)}</td>
    <td class="l">${money(it.invoiceCommission)}</td>
    <td class="l b">${money(it.amount)}</td></tr>`).join("");
  const body = `
    <table><thead><tr><th class="c">#</th><th>الفاتورة</th><th>العميل</th><th class="c">التاريخ</th><th class="l">إجمالي الفاتورة</th><th class="l">عمولة الفاتورة</th><th class="l">المسحوب منها</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="c">—</td></tr>`}</tbody></table>
    <div class="totals"><div class="grand"><span>إجمالي المبلغ المسحوب</span><span>${money(p.amount)}</span></div></div>
    <div class="sign"><div>توقيع الصنايعي (المستلم)</div><div>توقيع المحل</div></div>`;
  return docShell(`إيصال سحب عمولة ${p.serial}`, [
    `<span><b>رقم الإيصال:</b> ${esc(p.serial)}</span>`,
    `<span><b>التاريخ:</b> ${fdate(p.createdAt)}</span>`,
    `<span><b>الصنايعي:</b> ${esc(p.craftsmanName || "—")}</span>`,
    p.commissionPercent != null ? `<span><b>نسبة العمولة:</b> ${p.commissionPercent}%</span>` : "",
  ], body);
}

// ── archive entry points (best-effort, never throw into the request) ───────
async function write(html: string, subParts: string[], serial: string) {
  const root = getArchiveDir();
  if (!root) return; // archiving disabled
  const out = path.join(root, ...subParts, `${safeName(serial, "document")}.pdf`);
  await htmlToPdf(html, out);
}

export function archiveSale(invoiceId: number) {
  return Promise.resolve().then(() => {
    if (!getArchiveDir()) return;
    const inv = db.prepare(`SELECT si.*, c.name as customerName, cr.name as craftsmanName
      FROM sales_invoices si LEFT JOIN customers c ON si.customerId=c.id LEFT JOIN craftsmen cr ON si.craftsmanId=cr.id
      WHERE si.id=?`).get(invoiceId) as any;
    if (!inv) return;
    const items = db.prepare(`SELECT sii.*, p.nameAr as productName, p.sku FROM sales_invoice_items sii
      LEFT JOIN products p ON sii.productId=p.id WHERE sii.invoiceId=? ORDER BY sii.id`).all(invoiceId) as any[];
    return write(salesHtml(inv, items), ["العملاء", safeName(inv.customerName, "نقدي")], inv.serial);
  });
}

export function archivePurchase(purchaseId: number) {
  return Promise.resolve().then(() => {
    if (!getArchiveDir()) return;
    const pur = db.prepare(`SELECT pi.*, s.name as supplierName FROM purchase_invoices pi
      LEFT JOIN suppliers s ON pi.supplierId=s.id WHERE pi.id=?`).get(purchaseId) as any;
    if (!pur) return;
    const items = db.prepare(`SELECT pii.*, p.nameAr as productName, p.sku FROM purchase_invoice_items pii
      LEFT JOIN products p ON pii.productId=p.id WHERE pii.purchaseId=? ORDER BY pii.id`).all(purchaseId) as any[];
    return write(purchaseHtml(pur, items), ["المشتريات"], pur.serial);
  });
}

export function archiveReturn(returnId: number) {
  return Promise.resolve().then(() => {
    if (!getArchiveDir()) return;
    const ret = db.prepare(`SELECT r.*, c.name as customerName FROM returns r
      LEFT JOIN customers c ON r.customerId=c.id WHERE r.id=?`).get(returnId) as any;
    if (!ret) return;
    const items = db.prepare(`SELECT ri.* FROM return_items ri WHERE ri.returnId=? ORDER BY ri.kind DESC, ri.id`).all(returnId) as any[];
    return write(returnHtml(ret, items), ["العملاء", safeName(ret.customerName, "نقدي")], ret.serial);
  });
}

export function archivePayout(payoutId: number) {
  return Promise.resolve().then(() => {
    if (!getArchiveDir()) return;
    const p = db.prepare(`SELECT p.*, cr.name as craftsmanName, cr.commissionPercent
      FROM craftsman_payouts p JOIN craftsmen cr ON p.craftsmanId=cr.id WHERE p.id=?`).get(payoutId) as any;
    if (!p) return;
    const items = db.prepare(`SELECT pii.amount, si.serial, si.total as invoiceTotal, si.craftsmanCommission as invoiceCommission, si.createdAt, c.name as customerName
      FROM craftsman_payout_items pii JOIN sales_invoices si ON pii.invoiceId=si.id
      LEFT JOIN customers c ON si.customerId=c.id WHERE pii.payoutId=? ORDER BY si.createdAt`).all(payoutId) as any[];
    return write(payoutHtml(p, items), ["الصنايعية"], p.serial);
  });
}

export { browserAvailable };
