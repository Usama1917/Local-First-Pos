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
