import { Router } from "express";
import db from "../lib/db.js";
import { nextSerial, getSettings } from "../lib/db.js";
import { archiveSale } from "../lib/archive.js";
import { actorName } from "../lib/actor.js";
import { performDelete, reverseDocStock } from "../lib/deletion.js";

const router = Router();

const INVOICE_SELECT = `
  SELECT si.*, c.name as customerName, cr.name as craftsmanName
  FROM sales_invoices si
  LEFT JOIN customers c ON si.customerId = c.id
  LEFT JOIN craftsmen cr ON si.craftsmanId = cr.id
`;

function getItems(invoiceId: number) {
  return db.prepare(`
    SELECT sii.*, p.nameAr as productName, p.sku, p.barcode, u.name as unitName
    FROM sales_invoice_items sii
    LEFT JOIN products p ON sii.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE sii.invoiceId = ? ORDER BY sii.id
  `).all(invoiceId);
}

router.get("/sales", (req, res) => {
  const { search, status, customerId, craftsmanId, dateFrom, dateTo, paymentType, limit = 50, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(si.serial LIKE ? OR c.name LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s);
  }
  if (status) { conditions.push("si.status = ?"); params.push(status); }
  if (customerId) { conditions.push("si.customerId = ?"); params.push(Number(customerId)); }
  if (craftsmanId) { conditions.push("si.craftsmanId = ?"); params.push(Number(craftsmanId)); }
  if (paymentType) { conditions.push("si.paymentType = ?"); params.push(paymentType); }
  if (dateFrom) { conditions.push("date(si.createdAt) >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("date(si.createdAt) <= ?"); params.push(dateTo); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${INVOICE_SELECT} ${where} ORDER BY si.createdAt DESC LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM sales_invoices si LEFT JOIN customers c ON si.customerId = c.id ${where}`).get(...params) as any).c;
  res.json({ items, total });
});

router.post("/sales", (req, res) => {
  const s = getSettings();
  const serial = nextSerial(s?.invoicePrefix || "INV");
  const { customerId, craftsmanId, discount = 0, notes, paymentType = "cash", paidAmount, items = [], status = "draft" } = req.body;

  let subtotal = 0;
  for (const item of items) subtotal += Math.max(0, (item.unitPrice * item.quantity) - (item.discount || 0));
  const total = Math.max(0, subtotal - discount);
  const finalPaid = paidAmount !== undefined ? paidAmount : (paymentType === "cash" ? total : 0);
  const remaining = total - finalPaid;

  let commission = 0;
  if (craftsmanId) {
    const craftsman = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(craftsmanId) as any;
    if (craftsman?.commissionPercent) commission = (total * craftsman.commissionPercent) / 100;
  }

  // Header + items are one atomic unit — a failed item must not leave an orphan header.
  let invId = 0;
  db.exec("BEGIN");
  try {
    const r = db.prepare(`
      INSERT INTO sales_invoices (serial, status, paymentType, customerId, craftsmanId, subtotal, discount, total, paidAmount, remainingAmount, craftsmanCommission, notes, createdBy)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(serial, status, paymentType, customerId || null, craftsmanId || null, subtotal, discount, total, finalPaid, remaining, commission, notes || null, actorName(req));
    invId = r.lastInsertRowid as number;

    const insertItem = db.prepare("INSERT INTO sales_invoice_items (invoiceId, productId, quantity, unitPrice, discount, total) VALUES (?,?,?,?,?,?)");
    for (const item of items) {
      const t = Math.max(0, (item.unitPrice * item.quantity) - (item.discount || 0));
      insertItem.run(invId, item.productId, item.quantity, item.unitPrice, item.discount || 0, t);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.status(201).json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(invId), items: getItems(invId) });
});

router.get("/sales/lookup/:serial", (req, res) => {
  const row = db.prepare(`${INVOICE_SELECT} WHERE si.serial = ?`).get(req.params.serial);
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ ...(row as any), items: getItems((row as any).id) });
});

router.get("/sales/:id", (req, res) => {
  const row = db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ ...(row as any), items: getItems(Number(req.params.id)) });
});

router.patch("/sales/:id", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(id) as any;
  if (!inv) return res.status(404).json({ error: "غير موجود" });
  if (inv.status !== "draft") return res.status(400).json({ error: "لا يمكن تعديل فاتورة مُنجزة" });

  const { customerId, craftsmanId, discount, notes, paymentType, paidAmount, items } = req.body;

  // Money fields are ALWAYS re-derived (a discount/payment-only edit must update total/remaining too).
  const effDiscount = discount ?? inv.discount;
  const effPaymentType = paymentType ?? inv.paymentType;

  // The items rewrite + header update must be atomic — a mid-loop failure must
  // not leave the invoice with its old items deleted and none re-inserted.
  db.exec("BEGIN");
  try {
    // Recompute the subtotal: from the new items if provided, otherwise keep the stored one.
    let subtotal = inv.subtotal;
    if (items !== undefined) {
      db.prepare("DELETE FROM sales_invoice_items WHERE invoiceId = ?").run(id);
      subtotal = 0;
      const insertItem = db.prepare("INSERT INTO sales_invoice_items (invoiceId, productId, quantity, unitPrice, discount, total) VALUES (?,?,?,?,?,?)");
      for (const item of items) {
        const t = Math.max(0, (item.unitPrice * item.quantity) - (item.discount || 0));
        subtotal += t;
        insertItem.run(id, item.productId, item.quantity, item.unitPrice, item.discount || 0, t);
      }
    }

    const total = Math.max(0, subtotal - effDiscount);
    const fp = paidAmount !== undefined ? paidAmount : (effPaymentType === "cash" ? total : inv.paidAmount);
    const remaining = total - fp;

    db.prepare(`UPDATE sales_invoices SET
      customerId = COALESCE(?, customerId), craftsmanId = COALESCE(?, craftsmanId),
      discount = ?, notes = COALESCE(?, notes),
      paymentType = ?, paidAmount = ?, subtotal = ?, total = ?, remainingAmount = ?,
      updatedBy = ?, updatedAt = datetime('now') WHERE id = ?
    `).run(customerId || null, craftsmanId || null, effDiscount, notes || null, effPaymentType, fp, subtotal, total, remaining, actorName(req), id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(id), items: getItems(id) });
});

// Full deletion with accounting reversal (stock restored from the invoice's own
// movements, customer debt drops, quotation un-converted). Refuses when linked
// returns exist or commission was already paid out — see lib/deletion.ts.
router.delete("/sales/:id", (req, res) => {
  const err = performDelete("sales", Number(req.params.id), actorName(req));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

router.post("/sales/:id/finalize", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(id) as any;
  if (!inv) return res.status(404).json({ error: "غير موجود" });
  if (inv.status !== "draft") return res.status(400).json({ error: "الفاتورة مُنجزة بالفعل" });

  const items = getItems(id) as any[];
  const { paymentType, paidAmount } = req.body;
  const pt = paymentType || inv.paymentType;
  const finalPaid = paidAmount !== undefined ? paidAmount : (pt === "cash" ? inv.total : inv.paidAmount);
  const remaining = inv.total - finalPaid;

  let status = "finalized";
  if (pt === "credit") status = "credit";
  else if (remaining > 0) status = "partially_paid"; // any unpaid balance on a non-credit sale
  else status = pt === "cash" ? "finalized" : "paid";

  let commission = inv.craftsmanCommission;
  if (inv.craftsmanId) {
    const craftsman = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(inv.craftsmanId) as any;
    if (craftsman?.commissionPercent) commission = (inv.total * craftsman.commissionPercent) / 100;
  }

  db.exec("BEGIN");
  try {
    db.prepare(`UPDATE sales_invoices SET status = ?, paymentType = ?, paidAmount = ?, remainingAmount = ?, craftsmanCommission = ?, updatedBy = ?, updatedAt = datetime('now') WHERE id = ?`)
      .run(status, pt, finalPaid, remaining, commission, actorName(req), id);

    const updateStock = db.prepare("UPDATE products SET currentStock = currentStock - ?, updatedAt = datetime('now') WHERE id = ?");
    const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes) VALUES (?,?,?,?,?,?,?,?)");

    for (const item of items) {
      const prod = db.prepare("SELECT currentStock FROM products WHERE id = ?").get(item.productId) as any;
      const before = prod?.currentStock || 0;
      updateStock.run(item.quantity, item.productId);
      insertMove.run(item.productId, "sale", item.quantity, before, before - item.quantity, "sales_invoice", id, `فاتورة ${inv.serial}`);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.json(db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(id));
  // Auto-archive a PDF of the finalized invoice (best-effort, non-blocking).
  archiveSale(id).catch((e) => console.error("archive sale failed:", e?.message || e));
});

// Void an invoice: keep the row for audit but mark it cancelled, reversing the
// stock it deducted (via its own movements) so inventory stays correct. Same
// accounting guards as delete — refuse when returns reference it or commission
// was already paid out, otherwise the cancelled sale's debt/commission silently
// vanishes from the ledgers while its effects linger.
router.post("/sales/:id/cancel", (req, res) => {
  const id = Number(req.params.id);
  const inv = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(id) as any;
  if (!inv) return res.status(404).json({ error: "غير موجود" });
  if (inv.status === "cancelled") return res.json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(id), items: getItems(id) });
  if (inv.status === "draft") {
    // A draft never moved stock or recorded debt — just mark it cancelled.
    db.prepare("UPDATE sales_invoices SET status = 'cancelled', updatedBy = ?, updatedAt = datetime('now') WHERE id = ?").run(actorName(req), id);
    return res.json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(id), items: getItems(id) });
  }

  if (db.prepare("SELECT 1 FROM returns WHERE originalInvoiceId = ?").get(id)) {
    return res.status(400).json({ error: "يوجد مرتجع/استبدال مرتبط بهذه الفاتورة — احذف المرتجعات أولاً" });
  }
  if (inv.commissionPaid > 0.005 || (db.prepare("SELECT COUNT(*) as c FROM craftsman_payout_items WHERE invoiceId = ?").get(id) as any).c > 0) {
    return res.status(400).json({ error: "تم صرف عمولة عن هذه الفاتورة — لا يمكن إلغاؤها" });
  }

  db.exec("BEGIN");
  try {
    reverseDocStock("sales_invoice", id, `عكس إلغاء فاتورة ${inv.serial}`, actorName(req));
    db.prepare("UPDATE sales_invoices SET status = 'cancelled', updatedBy = ?, updatedAt = datetime('now') WHERE id = ?").run(actorName(req), id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(id), items: getItems(id) });
});

export default router;
