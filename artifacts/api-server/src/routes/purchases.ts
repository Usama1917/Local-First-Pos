import { Router } from "express";
import db from "../lib/db.js";
import { nextSerial, getSettings } from "../lib/db.js";
import { archivePurchase } from "../lib/archive.js";

const router = Router();

const PURCHASE_SELECT = `
  SELECT pi.*, s.name as supplierName
  FROM purchase_invoices pi
  LEFT JOIN suppliers s ON pi.supplierId = s.id
`;

function getItems(purchaseId: number) {
  return db.prepare(`
    SELECT pii.*, p.nameAr as productName, p.sku, p.barcode, u.name as unitName
    FROM purchase_invoice_items pii
    LEFT JOIN products p ON pii.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE pii.purchaseId = ? ORDER BY pii.id
  `).all(purchaseId);
}

router.get("/purchases", (req, res) => {
  const { search, status, supplierId, dateFrom, dateTo, limit = 50, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];
  if (search) {
    conditions.push("(pi.serial LIKE ? OR s.name LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q);
  }
  if (status) { conditions.push("pi.status = ?"); params.push(status); }
  if (supplierId) { conditions.push("pi.supplierId = ?"); params.push(Number(supplierId)); }
  if (dateFrom) { conditions.push("date(pi.createdAt) >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("date(pi.createdAt) <= ?"); params.push(dateTo); }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${PURCHASE_SELECT} ${where} ORDER BY pi.createdAt DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM purchase_invoices pi LEFT JOIN suppliers s ON pi.supplierId = s.id ${where}`).get(...params) as any).c;
  res.json({ items, total });
});

router.post("/purchases", (req, res) => {
  const s = getSettings();
  const serial = nextSerial(s?.purchasePrefix || "PUR");
  const { supplierId, paymentType = "cash", paidAmount, notes, invoiceDate, items = [], status = "draft" } = req.body;

  let subtotal = 0;
  for (const item of items) subtotal += item.total || (item.netPrice * item.quantity);
  const total = subtotal;
  const finalPaid = paidAmount !== undefined ? paidAmount : (paymentType === "cash" ? total : 0);
  const remaining = total - finalPaid;

  const r = db.prepare(`
    INSERT INTO purchase_invoices (serial, status, paymentType, supplierId, subtotal, total, paidAmount, remainingAmount, notes, invoiceDate)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(serial, status, paymentType, supplierId || null, subtotal, total, finalPaid, remaining, notes || null, invoiceDate || null);
  const purId = r.lastInsertRowid as number;

  const insertItem = db.prepare("INSERT INTO purchase_invoice_items (purchaseId, productId, quantity, listPrice, supplierDiscount, netPrice, extraCost, trueCost, total) VALUES (?,?,?,?,?,?,?,?,?)");
  for (const item of items) {
    insertItem.run(purId, item.productId, item.quantity, item.listPrice || 0, item.supplierDiscount || 0, item.netPrice || 0, item.extraCost || 0, item.trueCost || 0, item.total || 0);
  }

  res.status(201).json({ ...db.prepare(`${PURCHASE_SELECT} WHERE pi.id = ?`).get(purId), items: getItems(purId) });
});

router.get("/purchases/:id", (req, res) => {
  const row = db.prepare(`${PURCHASE_SELECT} WHERE pi.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ ...(row as any), items: getItems(Number(req.params.id)) });
});

router.patch("/purchases/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM purchase_invoices WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "غير موجود" });
  if (existing.status !== "draft") return res.status(400).json({ error: "لا يمكن تعديل فاتورة مُنجزة" });
  const { supplierId, paymentType, paidAmount, notes, invoiceDate, items } = req.body;

  if (items !== undefined) {
    db.prepare("DELETE FROM purchase_invoice_items WHERE purchaseId = ?").run(id);
    let subtotal = 0;
    for (const item of items) subtotal += item.total || 0;
    const fp = paidAmount !== undefined ? paidAmount : 0;
    db.prepare("UPDATE purchase_invoices SET subtotal = ?, total = ?, paidAmount = ?, remainingAmount = ? WHERE id = ?").run(subtotal, subtotal, fp, subtotal - fp, id);
    const insertItem = db.prepare("INSERT INTO purchase_invoice_items (purchaseId, productId, quantity, listPrice, supplierDiscount, netPrice, extraCost, trueCost, total) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const item of items) {
      insertItem.run(id, item.productId, item.quantity, item.listPrice || 0, item.supplierDiscount || 0, item.netPrice || 0, item.extraCost || 0, item.trueCost || 0, item.total || 0);
    }
  }

  db.prepare(`UPDATE purchase_invoices SET
    supplierId = COALESCE(?, supplierId), paymentType = COALESCE(?, paymentType),
    paidAmount = COALESCE(?, paidAmount), notes = COALESCE(?, notes),
    invoiceDate = COALESCE(?, invoiceDate), updatedAt = datetime('now') WHERE id = ?
  `).run(supplierId || null, paymentType || null, paidAmount ?? null, notes || null, invoiceDate || null, id);

  res.json({ ...db.prepare(`${PURCHASE_SELECT} WHERE pi.id = ?`).get(id), items: getItems(id) });
});

router.delete("/purchases/:id", (req, res) => {
  const id = Number(req.params.id);
  const pur = db.prepare("SELECT status FROM purchase_invoices WHERE id = ?").get(id) as any;
  if (!pur) return res.status(404).json({ error: "غير موجود" });
  // Cancelling a finalized purchase would leave its received stock in inventory.
  if (pur.status !== "draft") return res.status(400).json({ error: "لا يمكن حذف فاتورة مُنجزة" });
  db.prepare("UPDATE purchase_invoices SET status = 'cancelled', updatedAt = datetime('now') WHERE id = ?").run(id);
  res.json({ success: true });
});

router.post("/purchases/:id/finalize", (req, res) => {
  const id = Number(req.params.id);
  const pur = db.prepare("SELECT * FROM purchase_invoices WHERE id = ?").get(id) as any;
  if (!pur) return res.status(404).json({ error: "غير موجود" });
  if (pur.status !== "draft") return res.status(400).json({ error: "الفاتورة مُنجزة بالفعل" });

  const items = getItems(id) as any[];
  const { paymentType, paidAmount } = req.body;
  const pt = paymentType || pur.paymentType;
  const fp = paidAmount !== undefined ? paidAmount : (pt === "cash" ? pur.total : 0);
  const remaining = pur.total - fp;
  const status = remaining <= 0 ? "finalized" : remaining === pur.total ? "credit" : "partially_paid";

  db.exec("BEGIN");
  try {
    db.prepare("UPDATE purchase_invoices SET status = ?, paymentType = ?, paidAmount = ?, remainingAmount = ?, updatedAt = datetime('now') WHERE id = ?").run(status, pt, fp, remaining, id);

    const addStock = db.prepare("UPDATE products SET currentStock = currentStock + ?, updatedAt = datetime('now') WHERE id = ?");
    const setCost = db.prepare("UPDATE products SET trueCost = ? WHERE id = ?");
    const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes) VALUES (?,?,?,?,?,?,?,?)");

    for (const item of items) {
      const prod = db.prepare("SELECT currentStock FROM products WHERE id = ?").get(item.productId) as any;
      const before = prod?.currentStock || 0;
      addStock.run(item.quantity, item.productId);
      // Only refresh the stored cost from a real (>0) line cost — never wipe it to 0.
      if (item.trueCost > 0) setCost.run(item.trueCost, item.productId);
      insertMove.run(item.productId, "purchase", item.quantity, before, before + item.quantity, "purchase_invoice", id, `فاتورة مشتريات ${pur.serial}`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.json({ ...db.prepare(`${PURCHASE_SELECT} WHERE pi.id = ?`).get(id), items: getItems(id) });
  // Auto-archive a PDF of the finalized purchase invoice (best-effort).
  archivePurchase(id).catch((e) => console.error("archive purchase failed:", e?.message || e));
});

export default router;
