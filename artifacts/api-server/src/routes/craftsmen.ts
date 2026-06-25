import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/craftsmen", (req, res) => {
  const { search, isActive } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(cr.name LIKE ? OR cr.phone LIKE ? OR cr.jobType LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (isActive !== undefined) { conditions.push("cr.isActive = ?"); params.push(isActive === "true" ? 1 : 0); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`
    SELECT cr.*,
      COALESCE((SELECT SUM(si.total) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalSales,
      COALESCE((SELECT SUM(si.craftsmanCommission) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalCommission
    FROM craftsmen cr ${where} ORDER BY cr.name
  `).all(...params);
  res.json({ items, total: items.length });
});

router.post("/craftsmen", (req, res) => {
  const { name, phone, jobType, address, notes, commissionPercent, isActive = true } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare(`
    INSERT INTO craftsmen (name, phone, jobType, address, notes, commissionPercent, isActive)
    VALUES (?,?,?,?,?,?,?)
  `).run(name, phone || null, jobType || null, address || null, notes || null, commissionPercent || null, isActive ? 1 : 0);
  res.status(201).json(db.prepare("SELECT *, 0 as totalSales, 0 as totalCommission FROM craftsmen WHERE id = ?").get(r.lastInsertRowid));
});

router.get("/craftsmen/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`
    SELECT cr.*,
      COALESCE((SELECT SUM(si.total) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalSales,
      COALESCE((SELECT SUM(si.craftsmanCommission) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalCommission,
      COALESCE((SELECT COUNT(DISTINCT si.customerId) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.customerId IS NOT NULL AND si.status != 'draft'), 0) as uniqueCustomers,
      COALESCE((SELECT COUNT(*) FROM quotations q WHERE q.craftsmanId = cr.id), 0) as totalQuotations
    FROM craftsmen cr WHERE cr.id = ?
  `).get(id);
  if (!row) return res.status(404).json({ error: "غير موجود" });

  const recentSales = db.prepare(`
    SELECT si.id, si.serial, si.status, si.paymentType, si.total, si.paidAmount,
           si.remainingAmount, si.craftsmanCommission, si.createdAt,
           c.id as customerId, c.name as customerName
    FROM sales_invoices si
    LEFT JOIN customers c ON si.customerId = c.id
    WHERE si.craftsmanId = ? AND si.status != 'draft'
    ORDER BY si.createdAt DESC LIMIT 50
  `).all(id);

  const recentQuotations = db.prepare(`
    SELECT q.id, q.serial, q.status, q.total, q.createdAt, q.validUntil, q.convertedInvoiceId,
           c.id as customerId, c.name as customerName,
           si.serial as convertedInvoiceSerial
    FROM quotations q
    LEFT JOIN customers c ON q.customerId = c.id
    LEFT JOIN sales_invoices si ON q.convertedInvoiceId = si.id
    WHERE q.craftsmanId = ?
    ORDER BY q.createdAt DESC LIMIT 50
  `).all(id);

  res.json({ ...row as any, recentSales, recentQuotations });
});

router.get("/craftsmen/:id/customers", (req, res) => {
  const id = Number(req.params.id);
  const customers = db.prepare(`
    SELECT
      c.id, c.name, c.phone, c.area,
      COUNT(DISTINCT si.id) as invoiceCount,
      COALESCE(SUM(si.total), 0) as totalSales,
      COALESCE(SUM(si.remainingAmount), 0) as totalRemaining,
      MAX(si.createdAt) as lastInvoiceDate,
      COUNT(DISTINCT q.id) as quotationCount
    FROM customers c
    LEFT JOIN sales_invoices si ON si.customerId = c.id AND si.craftsmanId = ? AND si.status != 'draft'
    LEFT JOIN quotations q ON q.customerId = c.id AND q.craftsmanId = ?
    WHERE (si.id IS NOT NULL OR q.id IS NOT NULL)
    GROUP BY c.id, c.name, c.phone, c.area
    ORDER BY totalSales DESC
  `).all(id, id);
  res.json({ items: customers, total: customers.length });
});

router.patch("/craftsmen/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, jobType, address, notes, commissionPercent, isActive } = req.body;
  db.prepare(`
    UPDATE craftsmen SET
    name = COALESCE(?, name), phone = COALESCE(?, phone), jobType = COALESCE(?, jobType),
    address = COALESCE(?, address), notes = COALESCE(?, notes),
    commissionPercent = COALESCE(?, commissionPercent),
    isActive = COALESCE(?, isActive), updatedAt = datetime('now')
    WHERE id = ?
  `).run(name || null, phone || null, jobType || null, address || null, notes || null,
    commissionPercent ?? null, isActive !== undefined ? (isActive ? 1 : 0) : null, id);
  res.json(db.prepare("SELECT *, 0 as totalSales, 0 as totalCommission FROM craftsmen WHERE id = ?").get(id));
});

router.delete("/craftsmen/:id", (req, res) => {
  db.prepare("UPDATE craftsmen SET isActive = 0 WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

export default router;
