import { Router } from "express";
import db from "../lib/db.js";
import { nextSerial, getSettings } from "../lib/db.js";

const router = Router();

const QUOTATION_SELECT = `
  SELECT q.*, c.name as customerName, cr.name as craftsmanName,
    si.serial as convertedInvoiceSerial
  FROM quotations q
  LEFT JOIN customers c ON q.customerId = c.id
  LEFT JOIN craftsmen cr ON q.craftsmanId = cr.id
  LEFT JOIN sales_invoices si ON q.convertedInvoiceId = si.id
`;

function getItems(quotationId: number) {
  return db.prepare(`
    SELECT qi.*, p.nameAr as productName, p.sku, p.barcode, u.name as unitName
    FROM quotation_items qi
    LEFT JOIN products p ON qi.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE qi.quotationId = ?
    ORDER BY qi.id
  `).all(quotationId);
}

router.get("/quotations", (req, res) => {
  const { search, status, customerId, limit = 50, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];
  if (search) {
    conditions.push("(q.serial LIKE ? OR c.name LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s);
  }
  if (status) { conditions.push("q.status = ?"); params.push(status); }
  if (customerId) { conditions.push("q.customerId = ?"); params.push(Number(customerId)); }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${QUOTATION_SELECT} ${where} ORDER BY q.createdAt DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM quotations q LEFT JOIN customers c ON q.customerId = c.id ${where}`).get(...params) as any).c;
  res.json({ items, total });
});

router.post("/quotations", (req, res) => {
  const s = getSettings();
  const serial = nextSerial(s?.quotationPrefix || "QUO");
  const { customerId, craftsmanId, discount = 0, notes, validUntil, items = [], status = "draft" } = req.body;

  let subtotal = 0;
  for (const item of items) subtotal += (item.unitPrice * item.quantity) - (item.discount || 0);
  const total = subtotal - discount;

  const r = db.prepare(`
    INSERT INTO quotations (serial, status, customerId, craftsmanId, subtotal, discount, total, notes, validUntil)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(serial, status, customerId || null, craftsmanId || null, subtotal, discount, total, notes || null, validUntil || null);
  const qId = r.lastInsertRowid as number;

  const insertItem = db.prepare("INSERT INTO quotation_items (quotationId, productId, quantity, unitPrice, discount, total, notes) VALUES (?,?,?,?,?,?,?)");
  for (const item of items) {
    const t = (item.unitPrice * item.quantity) - (item.discount || 0);
    insertItem.run(qId, item.productId, item.quantity, item.unitPrice, item.discount || 0, t, item.notes || null);
  }

  res.status(201).json({ ...db.prepare(`${QUOTATION_SELECT} WHERE q.id = ?`).get(qId), items: getItems(qId) });
});

router.get("/quotations/:id", (req, res) => {
  const row = db.prepare(`${QUOTATION_SELECT} WHERE q.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ ...row as any, items: getItems(Number(req.params.id)) });
});

router.patch("/quotations/:id", (req, res) => {
  const id = Number(req.params.id);
  const { customerId, craftsmanId, discount, notes, validUntil, status, items } = req.body;

  if (items !== undefined) {
    db.prepare("DELETE FROM quotation_items WHERE quotationId = ?").run(id);
    let subtotal = 0;
    for (const item of items) subtotal += (item.unitPrice * item.quantity) - (item.discount || 0);
    const total = subtotal - (discount || 0);
    db.prepare("UPDATE quotations SET subtotal = ?, total = ? WHERE id = ?").run(subtotal, total, id);
    const insertItem = db.prepare("INSERT INTO quotation_items (quotationId, productId, quantity, unitPrice, discount, total, notes) VALUES (?,?,?,?,?,?,?)");
    for (const item of items) {
      const t = (item.unitPrice * item.quantity) - (item.discount || 0);
      insertItem.run(id, item.productId, item.quantity, item.unitPrice, item.discount || 0, t, item.notes || null);
    }
  }

  db.prepare(`UPDATE quotations SET
    customerId = COALESCE(?, customerId), craftsmanId = COALESCE(?, craftsmanId),
    discount = COALESCE(?, discount), notes = COALESCE(?, notes), validUntil = COALESCE(?, validUntil),
    status = COALESCE(?, status), updatedAt = datetime('now') WHERE id = ?
  `).run(customerId || null, craftsmanId || null, discount ?? null, notes || null, validUntil || null, status || null, id);

  res.json({ ...db.prepare(`${QUOTATION_SELECT} WHERE q.id = ?`).get(id), items: getItems(id) });
});

router.delete("/quotations/:id", (req, res) => {
  db.prepare("UPDATE quotations SET status = 'cancelled', updatedAt = datetime('now') WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

router.post("/quotations/:id/convert", (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare("SELECT * FROM quotations WHERE id = ?").get(id) as any;
  if (!q) return res.status(404).json({ error: "غير موجود" });
  if (q.status === "converted") return res.status(400).json({ error: "تم تحويل هذه التسعيرة مسبقاً" });

  const s = getSettings();
  const serial = nextSerial(s?.invoicePrefix || "INV");
  const { paymentType = "cash", paidAmount } = req.body;

  const items = getItems(id) as any[];
  const finalPaid = paidAmount !== undefined ? paidAmount : (paymentType === "cash" ? q.total : 0);
  const remaining = q.total - finalPaid;

  const invoiceStatus = paymentType === "cash" ? "finalized" : remaining <= 0 ? "paid" : "credit";

  let commission = 0;
  if (q.craftsmanId) {
    const craftsman = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(q.craftsmanId) as any;
    if (craftsman?.commissionPercent) commission = (q.total * craftsman.commissionPercent) / 100;
  }

  const r = db.prepare(`
    INSERT INTO sales_invoices (serial, status, paymentType, customerId, craftsmanId, subtotal, discount, total, paidAmount, remainingAmount, craftsmanCommission, quotationId)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(serial, invoiceStatus, paymentType, q.customerId, q.craftsmanId, q.subtotal, q.discount, q.total, finalPaid, remaining, commission, id);
  const invId = r.lastInsertRowid as number;

  const insertItem = db.prepare("INSERT INTO sales_invoice_items (invoiceId, productId, quantity, unitPrice, discount, total) VALUES (?,?,?,?,?,?)");
  const updateStock = db.prepare("UPDATE products SET currentStock = currentStock - ?, updatedAt = datetime('now') WHERE id = ?");
  const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes) VALUES (?,?,?,?,?,?,?,?)");

  for (const item of items) {
    insertItem.run(invId, item.productId, item.quantity, item.unitPrice, item.discount, item.total);
    const prod = db.prepare("SELECT currentStock FROM products WHERE id = ?").get(item.productId) as any;
    const before = prod?.currentStock || 0;
    updateStock.run(item.quantity, item.productId);
    insertMove.run(item.productId, "sale", item.quantity, before, before - item.quantity, "sales_invoice", invId, `فاتورة ${serial}`);
  }

  db.prepare("UPDATE quotations SET status = 'converted', convertedInvoiceId = ?, updatedAt = datetime('now') WHERE id = ?").run(invId, id);

  const invoice = db.prepare(`
    SELECT si.*, c.name as customerName, cr.name as craftsmanName
    FROM sales_invoices si
    LEFT JOIN customers c ON si.customerId = c.id
    LEFT JOIN craftsmen cr ON si.craftsmanId = cr.id
    WHERE si.id = ?
  `).get(invId);

  res.json(invoice);
});

router.post("/quotations/:id/duplicate", (req, res) => {
  const id = Number(req.params.id);
  const q = db.prepare("SELECT * FROM quotations WHERE id = ?").get(id) as any;
  if (!q) return res.status(404).json({ error: "غير موجود" });
  const items = getItems(id) as any[];

  const s = getSettings();
  const serial = nextSerial(s?.quotationPrefix || "QUO");
  const r = db.prepare(`
    INSERT INTO quotations (serial, status, customerId, craftsmanId, subtotal, discount, total, notes, validUntil)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(serial, "draft", q.customerId, q.craftsmanId, q.subtotal, q.discount, q.total, q.notes, q.validUntil);
  const newId = r.lastInsertRowid as number;

  const insertItem = db.prepare("INSERT INTO quotation_items (quotationId, productId, quantity, unitPrice, discount, total, notes) VALUES (?,?,?,?,?,?,?)");
  for (const item of items) {
    insertItem.run(newId, item.productId, item.quantity, item.unitPrice, item.discount, item.total, item.notes);
  }

  res.status(201).json({ ...db.prepare(`${QUOTATION_SELECT} WHERE q.id = ?`).get(newId), items: getItems(newId) });
});

export default router;
