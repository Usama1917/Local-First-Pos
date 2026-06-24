import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/dashboard/summary", (_req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const todayInvoices = db.prepare(`
    SELECT 
      COUNT(*) as count,
      COALESCE(SUM(total), 0) as total,
      COALESCE(SUM(CASE WHEN paymentType = 'cash' THEN paidAmount ELSE 0 END), 0) as cash,
      COALESCE(SUM(CASE WHEN paymentType != 'cash' THEN total ELSE 0 END), 0) as credit
    FROM sales_invoices 
    WHERE status != 'draft' AND status != 'cancelled' AND date(createdAt) = ?
  `).get(today) as any;

  const totalReceivables = db.prepare(`
    SELECT COALESCE(SUM(remainingAmount), 0) as total FROM sales_invoices 
    WHERE status IN ('finalized', 'partially_paid', 'credit') AND remainingAmount > 0
  `).get() as any;

  const totalPayables = db.prepare(`
    SELECT COALESCE(SUM(remainingAmount), 0) as total FROM purchase_invoices 
    WHERE status IN ('finalized', 'partially_paid', 'credit') AND remainingAmount > 0
  `).get() as any;

  const settings = db.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
  const lowStockCount = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE isActive = 1 AND currentStock <= minStock
  `).get() as any;

  const pendingQuotations = db.prepare(`
    SELECT COUNT(*) as count FROM quotations WHERE status IN ('draft', 'confirmed')
  `).get() as any;

  const stockValue = db.prepare(`
    SELECT COALESCE(SUM(currentStock * trueCost), 0) as value FROM products WHERE isActive = 1
  `).get() as any;

  res.json({
    todaySales: todayInvoices.total || 0,
    todayCash: todayInvoices.cash || 0,
    todayCredit: todayInvoices.credit || 0,
    todayInvoicesCount: todayInvoices.count || 0,
    totalReceivables: totalReceivables.total || 0,
    totalPayables: totalPayables.total || 0,
    lowStockCount: lowStockCount.count || 0,
    pendingQuotations: pendingQuotations.count || 0,
    stockValue: stockValue.value || 0,
  });
});

router.get("/dashboard/recent-invoices", (_req, res) => {
  const invoices = db.prepare(`
    SELECT si.*, c.name as customerName, cr.name as craftsmanName
    FROM sales_invoices si
    LEFT JOIN customers c ON si.customerId = c.id
    LEFT JOIN craftsmen cr ON si.craftsmanId = cr.id
    WHERE si.status != 'draft'
    ORDER BY si.createdAt DESC LIMIT 10
  `).all();
  res.json(invoices);
});

router.get("/dashboard/recent-quotations", (_req, res) => {
  const quotations = db.prepare(`
    SELECT q.*, c.name as customerName, cr.name as craftsmanName
    FROM quotations q
    LEFT JOIN customers c ON q.customerId = c.id
    LEFT JOIN craftsmen cr ON q.craftsmanId = cr.id
    ORDER BY q.createdAt DESC LIMIT 10
  `).all();
  res.json(quotations);
});

router.get("/dashboard/low-stock", (_req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as categoryName, b.name as brandName, s.name as supplierName, u.name as unitName,
    CASE WHEN p.currentStock <= p.minStock THEN 1 ELSE 0 END as isLowStock
    FROM products p
    LEFT JOIN categories c ON p.categoryId = c.id
    LEFT JOIN brands b ON p.brandId = b.id
    LEFT JOIN suppliers s ON p.supplierId = s.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE p.isActive = 1 AND p.currentStock <= p.minStock
    ORDER BY p.currentStock ASC LIMIT 20
  `).all();
  res.json(products);
});

export default router;
