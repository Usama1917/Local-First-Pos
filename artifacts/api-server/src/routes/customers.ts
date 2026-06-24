import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

const CUSTOMER_SELECT = `
  SELECT c.*,
    COALESCE(c.openingBalance, 0) + COALESCE((SELECT SUM(si.remainingAmount) FROM sales_invoices si WHERE si.customerId = c.id AND si.status IN ('finalized','partially_paid','credit')), 0) as totalDebt
  FROM customers c
`;

router.get("/customers", (req, res) => {
  const { search, isActive } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(c.name LIKE ? OR c.phone LIKE ? OR c.area LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (isActive !== undefined) { conditions.push("c.isActive = ?"); params.push(isActive === "true" ? 1 : 0); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${CUSTOMER_SELECT} ${where} ORDER BY c.name`).all(...params);
  res.json({ items, total: items.length });
});

router.post("/customers", (req, res) => {
  const { name, phone, phone2, address, area, notes, openingBalance = 0, creditLimit, isActive = true } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare(`
    INSERT INTO customers (name, phone, phone2, address, area, notes, openingBalance, creditLimit, isActive)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(name, phone || null, phone2 || null, address || null, area || null, notes || null, openingBalance, creditLimit || null, isActive ? 1 : 0);
  res.status(201).json(db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ?`).get(r.lastInsertRowid));
});

router.get("/customers/:id", (req, res) => {
  const row = db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.patch("/customers/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, phone2, address, area, notes, openingBalance, creditLimit, isActive } = req.body;
  db.prepare(`
    UPDATE customers SET
    name = COALESCE(?, name), phone = COALESCE(?, phone), phone2 = COALESCE(?, phone2),
    address = COALESCE(?, address), area = COALESCE(?, area), notes = COALESCE(?, notes),
    openingBalance = COALESCE(?, openingBalance), creditLimit = COALESCE(?, creditLimit),
    isActive = COALESCE(?, isActive), updatedAt = datetime('now')
    WHERE id = ?
  `).run(name || null, phone || null, phone2 || null, address || null, area || null, notes || null,
    openingBalance ?? null, creditLimit ?? null, isActive !== undefined ? (isActive ? 1 : 0) : null, id);
  res.json(db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ?`).get(id));
});

router.delete("/customers/:id", (req, res) => {
  db.prepare("UPDATE customers SET isActive = 0 WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

router.get("/customers/:id/statement", (req, res) => {
  const id = Number(req.params.id);
  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as any;
  if (!customer) return res.status(404).json({ error: "غير موجود" });

  const invoices = db.prepare(`
    SELECT id, serial, createdAt as date, total, paidAmount, remainingAmount, paymentType, status, 'invoice' as type
    FROM sales_invoices WHERE customerId = ? AND status != 'draft'
    ORDER BY createdAt ASC
  `).all(id) as any[];

  const payments = db.prepare(`
    SELECT id, date, amount, notes, 'payment' as type FROM customer_payments WHERE customerId = ?
    ORDER BY date ASC
  `).all(id) as any[];

  let balance = customer.openingBalance || 0;
  const entries: any[] = [];
  
  if (balance !== 0) {
    entries.push({ type: "opening", date: customer.createdAt, description: "رصيد افتتاحي", debit: balance > 0 ? balance : 0, credit: balance < 0 ? Math.abs(balance) : 0, balance });
  }

  const all = [
    ...invoices.map(i => ({ ...i, sortDate: i.date })),
    ...payments.map(p => ({ ...p, sortDate: p.date })),
  ].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  for (const entry of all) {
    if (entry.type === "invoice") {
      balance += entry.remainingAmount;
      entries.push({ type: "invoice", date: entry.date, description: `فاتورة #${entry.serial}`, debit: entry.remainingAmount, credit: 0, balance, invoiceId: entry.id, serial: entry.serial });
    } else {
      balance -= entry.amount;
      entries.push({ type: "payment", date: entry.date, description: `دفعة: ${entry.notes || ""}`, debit: 0, credit: entry.amount, balance, paymentId: entry.id });
    }
  }

  res.json({ customer, entries, currentBalance: balance, totalInvoiced: invoices.reduce((s, i) => s + i.total, 0), totalPaid: payments.reduce((s, p) => s + p.amount, 0) });
});

router.get("/customers/:id/payments", (req, res) => {
  const payments = db.prepare("SELECT * FROM customer_payments WHERE customerId = ? ORDER BY date DESC").all(Number(req.params.id));
  res.json(payments);
});

router.post("/customers/:id/payments", (req, res) => {
  const id = Number(req.params.id);
  const { amount, date, notes } = req.body;
  if (!amount || !date) return res.status(400).json({ error: "المبلغ والتاريخ مطلوبان" });
  const r = db.prepare("INSERT INTO customer_payments (customerId, amount, date, notes) VALUES (?,?,?,?)").run(id, amount, date, notes || null);
  res.status(201).json(db.prepare("SELECT * FROM customer_payments WHERE id = ?").get(r.lastInsertRowid));
});

export default router;
