import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// Format a Date as a LOCAL YYYY-MM-DD. Using toISOString() here shifts to UTC and
// can land on the previous/next day for the shop's timezone near midnight, making
// the default "this month" range start on the wrong day.
const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthStart = () => { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth(), 1)); };
const todayLocal = () => localISO(new Date());

router.get("/reports/sales", (req, res) => {
  const { dateFrom, dateTo } = req.query as any;
  const from = dateFrom || monthStart();
  const to = dateTo || todayLocal();

  const invoiceSummary = db.prepare(`
    SELECT
      COUNT(*) as totalInvoices,
      COALESCE(SUM(total), 0) as totalSales,
      COALESCE(SUM(paidAmount), 0) as totalCash,
      COALESCE(SUM(remainingAmount), 0) as totalCredit,
      COALESCE(SUM(discount), 0) as totalDiscount
    FROM sales_invoices
    WHERE status NOT IN ('draft','cancelled','amended') AND date(createdAt) BETWEEN ? AND ?
  `).get(from, to) as any;

  // Returns/exchanges adjust net sales and cash: netAmount is negative for a pure
  // refund (revenue & cash out) and the settled difference for an exchange.
  const returnsSummary = db.prepare(`
    SELECT
      COALESCE(SUM(netAmount), 0) as net,
      COALESCE(SUM(CASE WHEN settlementType = 'cash' THEN netAmount ELSE 0 END), 0) as cashNet,
      COALESCE(SUM(returnedTotal), 0) as returnedTotal
    FROM returns WHERE date(createdAt) BETWEEN ? AND ?
  `).get(from, to) as any;

  const summary = {
    totalInvoices: invoiceSummary.totalInvoices,
    totalSales: (invoiceSummary.totalSales || 0) + (returnsSummary.net || 0),
    totalCash: (invoiceSummary.totalCash || 0) + (returnsSummary.cashNet || 0),
    totalCredit: invoiceSummary.totalCredit || 0,
    totalDiscount: invoiceSummary.totalDiscount || 0,
    totalReturns: returnsSummary.returnedTotal || 0,
  };

  const daily = db.prepare(`
    SELECT date(createdAt) as date,
      COUNT(*) as invoices,
      COALESCE(SUM(total), 0) as sales,
      COALESCE(SUM(paidAmount), 0) as cash
    FROM sales_invoices
    WHERE status NOT IN ('draft','cancelled','amended') AND date(createdAt) BETWEEN ? AND ?
    GROUP BY date(createdAt) ORDER BY date ASC
  `).all(from, to);

  // LEFT JOIN + COALESCE so sales of uncategorized products still appear.
  const byCategory = db.prepare(`
    SELECT COALESCE(c.name, 'بدون تصنيف') as category, COALESCE(SUM(sii.total), 0) as sales, COALESCE(SUM(sii.quantity), 0) as qty
    FROM sales_invoice_items sii
    JOIN products p ON sii.productId = p.id
    LEFT JOIN categories c ON p.categoryId = c.id
    JOIN sales_invoices si ON sii.invoiceId = si.id
    WHERE si.status NOT IN ('draft','cancelled','amended') AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY p.categoryId ORDER BY sales DESC
  `).all(from, to);

  res.json({ summary, daily, byCategory, dateFrom: from, dateTo: to });
});

router.get("/reports/inventory", (_req, res) => {
  const rows = db.prepare(`
    SELECT p.nameAr, p.sku, p.currentStock, p.minStock, p.trueCost, p.sellingPrice,
      c.name as categoryName, u.name as unitName,
      p.currentStock * p.trueCost as stockValue,
      p.currentStock * p.sellingPrice as retailValue,
      CASE WHEN p.currentStock <= p.minStock THEN 1 ELSE 0 END as isLowStock
    FROM products p
    LEFT JOIN categories c ON p.categoryId = c.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE p.isActive = 1
    ORDER BY c.name, p.nameAr
  `).all();

  const summary = db.prepare(`
    SELECT
      COUNT(*) as totalProducts,
      COUNT(CASE WHEN currentStock <= minStock THEN 1 END) as lowStockCount,
      COUNT(CASE WHEN currentStock = 0 THEN 1 END) as outOfStockCount,
      COALESCE(SUM(currentStock * trueCost), 0) as totalStockValue
    FROM products WHERE isActive = 1
  `).get();

  res.json({ items: rows, summary });
});

router.get("/reports/best-sellers", (req, res) => {
  const { dateFrom, dateTo, limit = 20 } = req.query as any;
  const from = dateFrom || monthStart();
  const to = dateTo || todayLocal();

  const items = db.prepare(`
    SELECT p.id, p.nameAr, p.sku, c.name as categoryName,
      COALESCE(SUM(sii.quantity), 0) as totalQty,
      COALESCE(SUM(sii.total), 0) as totalRevenue
    FROM sales_invoice_items sii
    JOIN products p ON sii.productId = p.id
    LEFT JOIN categories c ON p.categoryId = c.id
    JOIN sales_invoices si ON sii.invoiceId = si.id
    WHERE si.status NOT IN ('draft','cancelled','amended') AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY p.id ORDER BY totalQty DESC LIMIT ?
  `).all(from, to, Number(limit));
  res.json(items);
});

router.get("/reports/purchases", (req, res) => {
  const { dateFrom, dateTo } = req.query as any;
  const from = dateFrom || monthStart();
  const to = dateTo || todayLocal();

  const summary = db.prepare(`
    SELECT COUNT(*) as totalInvoices, COALESCE(SUM(total), 0) as totalPurchases,
      COALESCE(SUM(paidAmount), 0) as totalPaid, COALESCE(SUM(remainingAmount), 0) as totalRemaining
    FROM purchase_invoices
    WHERE status NOT IN ('draft','cancelled') AND date(createdAt) BETWEEN ? AND ?
  `).get(from, to);

  const bySupplier = db.prepare(`
    SELECT s.name as supplier, COALESCE(SUM(pi.total), 0) as total
    FROM purchase_invoices pi JOIN suppliers s ON pi.supplierId = s.id
    WHERE pi.status NOT IN ('draft','cancelled') AND date(pi.createdAt) BETWEEN ? AND ?
    GROUP BY s.id ORDER BY total DESC
  `).all(from, to);

  res.json({ summary, bySupplier, dateFrom: from, dateTo: to });
});

// ------------------------------------------------------------- profit ------
// One period's full P&L. Everything is attributed to the period the DOCUMENT falls
// in — a return in October adjusts October, even if the sale it reverses was in
// September. That is the only rule that keeps each period's numbers final once the
// period closes.
//
// Costs come from the `costAtSale` snapshot written when the goods left, NOT from
// products.trueCost, so a supplier's price rise today cannot rewrite last month's
// profit. Rows predating the snapshot were backfilled once at boot (see db.ts).

const LIVE_INVOICES = "si.status NOT IN ('draft','cancelled','amended')";
const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

function computeProfit(from: string, to: string) {
  // 1. What the shop invoiced, and the commission those invoices accrued.
  const inv = db.prepare(`
    SELECT COUNT(*) as invoiceCount,
           COALESCE(SUM(si.total), 0) as revenue,
           COALESCE(SUM(si.discount), 0) as discount,
           COALESCE(SUM(si.craftsmanCommission), 0) as commission
    FROM sales_invoices si
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
  `).get(from, to) as any;

  // 2. Cost of everything those invoices shipped.
  const sold = db.prepare(`
    SELECT COALESCE(SUM(sii.quantity * COALESCE(sii.costAtSale, p.trueCost, 0)), 0) as cogs,
           COUNT(*) as lineCount,
           COUNT(CASE WHEN COALESCE(sii.costAtSale, p.trueCost, 0) <= 0 THEN 1 END) as zeroCostLines
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON sii.invoiceId = si.id
    LEFT JOIN products p ON sii.productId = p.id
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
  `).get(from, to) as any;

  // 3. Returns & exchanges. A restocked return hands the goods back, so its cost
  //    comes OUT of COGS; a damaged one doesn't, so that cost stays a loss.
  const ret = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN ri.kind = 'returned' THEN ri.total ELSE 0 END), 0) as returnedRevenue,
      COALESCE(SUM(CASE WHEN ri.kind = 'new' THEN ri.total ELSE 0 END), 0) as exchangeRevenue,
      COALESCE(SUM(CASE WHEN ri.kind = 'returned' AND ri.restock = 1
                        THEN ri.quantity * COALESCE(ri.costAtSale, p.trueCost, 0) ELSE 0 END), 0) as recoveredCost,
      COALESCE(SUM(CASE WHEN ri.kind = 'returned' AND ri.restock = 0
                        THEN ri.quantity * COALESCE(ri.costAtSale, p.trueCost, 0) ELSE 0 END), 0) as damagedCost,
      COALESCE(SUM(CASE WHEN ri.kind = 'new'
                        THEN ri.quantity * COALESCE(ri.costAtSale, p.trueCost, 0) ELSE 0 END), 0) as exchangeCost
    FROM return_items ri
    JOIN returns r ON ri.returnId = r.id
    LEFT JOIN products p ON ri.productId = p.id
    WHERE date(r.createdAt) BETWEEN ? AND ?
  `).get(from, to) as any;

  // 4. Operating costs recorded on the expenses page (ad-hoc + paid salaries/rent).
  //    expenses.date is already a local calendar day, so it compares directly.
  const exp = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM expenses WHERE date BETWEEN ? AND ?
  `).get(from, to) as any;

  const revenue = (inv.revenue || 0) - (ret.returnedRevenue || 0) + (ret.exchangeRevenue || 0);
  const cogs = (sold.cogs || 0) - (ret.recoveredCost || 0) + (ret.exchangeCost || 0);
  const grossProfit = revenue - cogs;
  const commission = inv.commission || 0;
  const expenses = exp.total || 0;
  const netProfit = grossProfit - commission - expenses;

  return {
    dateFrom: from,
    dateTo: to,
    invoiceCount: inv.invoiceCount || 0,
    // Revenue side
    grossSales: r2(inv.revenue),
    invoiceDiscount: r2(inv.discount),
    returnedRevenue: r2(ret.returnedRevenue),
    exchangeRevenue: r2(ret.exchangeRevenue),
    revenue: r2(revenue),
    // Cost side
    soldCost: r2(sold.cogs),
    recoveredCost: r2(ret.recoveredCost),
    damagedCost: r2(ret.damagedCost),
    exchangeCost: r2(ret.exchangeCost),
    cogs: r2(cogs),
    // Results
    grossProfit: r2(grossProfit),
    commission: r2(commission),
    expenses: r2(expenses),
    expenseCount: exp.count || 0,
    netProfit: r2(netProfit),
    grossMargin: revenue > 0 ? r2((grossProfit / revenue) * 100) : 0,
    netMargin: revenue > 0 ? r2((netProfit / revenue) * 100) : 0,
    // Honesty flag: lines whose cost is unknown/zero make the profit look too good.
    zeroCostLines: sold.zeroCostLines || 0,
    lineCount: sold.lineCount || 0,
  };
}

/** Shift a local YYYY-MM-DD by N months, clamping to the target month's length. */
function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return localISO(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

router.get("/reports/profit", (req, res) => {
  const { dateFrom, dateTo } = req.query as any;
  const from = dateFrom || monthStart();
  const to = dateTo || todayLocal();
  const today = todayLocal();

  // Rolling windows so the owner can compare without changing the range.
  const windows = [
    { key: "1m", label: "آخر شهر", months: 1 },
    { key: "3m", label: "آخر 3 شهور", months: 3 },
    { key: "6m", label: "آخر 6 شهور", months: 6 },
  ].map((w) => {
    // computeProfit already reports the range it covered, so don't restate it.
    return { ...w, ...computeProfit(shiftMonths(today, -w.months), today) };
  });

  // Per-day series for the trend. Revenue and cost are aggregated separately and
  // merged here — one pass each, instead of a correlated subquery per day.
  const dailyRevenue = db.prepare(`
    SELECT date(si.createdAt) as date, COALESCE(SUM(si.total), 0) as revenue
    FROM sales_invoices si
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY date(si.createdAt)
  `).all(from, to) as any[];

  const dailyCost = db.prepare(`
    SELECT date(si.createdAt) as date,
           COALESCE(SUM(sii.quantity * COALESCE(sii.costAtSale, p.trueCost, 0)), 0) as cost
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON sii.invoiceId = si.id
    LEFT JOIN products p ON sii.productId = p.id
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY date(si.createdAt)
  `).all(from, to) as any[];

  const costByDate = new Map(dailyCost.map((d) => [d.date, d.cost]));
  const daily = dailyRevenue
    .map((d) => ({ date: d.date, revenue: d.revenue, cost: costByDate.get(d.date) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Profit per category — where the money is actually made.
  const byCategory = db.prepare(`
    SELECT COALESCE(c.name, 'بدون تصنيف') as category,
           COALESCE(SUM(sii.total), 0) as revenue,
           COALESCE(SUM(sii.quantity * COALESCE(sii.costAtSale, p.trueCost, 0)), 0) as cost,
           COALESCE(SUM(sii.quantity), 0) as qty
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON sii.invoiceId = si.id
    JOIN products p ON sii.productId = p.id
    LEFT JOIN categories c ON p.categoryId = c.id
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY p.categoryId ORDER BY (revenue - cost) DESC
  `).all(from, to) as any[];

  // Most/least profitable products.
  const byProduct = db.prepare(`
    SELECT p.id, p.nameAr, p.sku,
           COALESCE(SUM(sii.quantity), 0) as qty,
           COALESCE(SUM(sii.total), 0) as revenue,
           COALESCE(SUM(sii.quantity * COALESCE(sii.costAtSale, p.trueCost, 0)), 0) as cost
    FROM sales_invoice_items sii
    JOIN sales_invoices si ON sii.invoiceId = si.id
    JOIN products p ON sii.productId = p.id
    WHERE ${LIVE_INVOICES} AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY p.id ORDER BY (revenue - cost) DESC LIMIT 50
  `).all(from, to) as any[];

  // What the operating costs were spent on, so a bad month can be explained.
  const expensesByCategory = db.prepare(`
    SELECT COALESCE(NULLIF(category, ''), 'بدون بند') as category,
           COALESCE(SUM(amount), 0) as total, COUNT(*) as count
    FROM expenses WHERE date BETWEEN ? AND ?
    GROUP BY COALESCE(NULLIF(category, ''), 'بدون بند') ORDER BY total DESC
  `).all(from, to) as any[];

  const withProfit = (rows: any[]) =>
    rows.map((r) => ({
      ...r,
      revenue: r2(r.revenue),
      cost: r2(r.cost),
      profit: r2(r.revenue - r.cost),
      margin: r.revenue > 0 ? r2(((r.revenue - r.cost) / r.revenue) * 100) : 0,
    }));

  res.json({
    ...computeProfit(from, to),
    windows,
    daily: withProfit(daily),
    byCategory: withProfit(byCategory),
    byProduct: withProfit(byProduct),
    expensesByCategory,
  });
});

router.get("/reports/craftsman-commission", (req, res) => {
  const { dateFrom, dateTo } = req.query as any;
  const from = dateFrom || monthStart();
  const to = dateTo || todayLocal();

  // Keep all active craftsmen (even with zero activity), and also archived ones
  // that DID have invoices in the range, so historical totals stay stable after a
  // craftsman is archived.
  const rows = db.prepare(`
    SELECT cr.id, cr.name, cr.phone, cr.jobType, cr.commissionPercent,
      COUNT(si.id) as invoiceCount,
      COALESCE(SUM(si.total), 0) as totalSales,
      COALESCE(SUM(si.craftsmanCommission), 0) as totalCommission
    FROM craftsmen cr
    LEFT JOIN sales_invoices si ON si.craftsmanId = cr.id
      AND si.status NOT IN ('draft','cancelled','amended')
      AND date(si.createdAt) BETWEEN ? AND ?
    GROUP BY cr.id
    HAVING cr.isActive = 1 OR COUNT(si.id) > 0
    ORDER BY totalCommission DESC
  `).all(from, to);
  res.json(rows);
});

export default router;
