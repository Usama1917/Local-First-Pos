import { Router } from "express";
import db from "../lib/db.js";
import { nextSerial, getSettings } from "../lib/db.js";
import { archiveSale } from "../lib/archive.js";
import { actorName } from "../lib/actor.js";
import { performDelete, reverseDocStock } from "../lib/deletion.js";

const router = Router();

// `orig`/`nxt` expose the amendment chain to the UI: a corrected invoice carries
// the original's serial + who made it and when (so the audit popover can show both
// the original author and the editor), and a superseded one links forward.
const INVOICE_SELECT = `
  SELECT si.*, c.name as customerName, cr.name as craftsmanName,
         orig.serial as amendedFromSerial, orig.createdBy as amendedFromBy,
         orig.createdAt as amendedFromAt, nxt.serial as amendedToSerial
  FROM sales_invoices si
  LEFT JOIN customers c ON si.customerId = c.id
  LEFT JOIN craftsmen cr ON si.craftsmanId = cr.id
  LEFT JOIN sales_invoices orig ON si.amendedFromId = orig.id
  LEFT JOIN sales_invoices nxt ON si.amendedToId = nxt.id
`;

function getItems(invoiceId: number) {
  return db.prepare(`
    SELECT sii.*, p.nameAr as productName, p.sku, p.barcode, u.name as unitName,
           p.minSellingPrice, p.soldByWeight
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

    // Freeze each line's cost now that the goods have actually left. Later purchases
    // move products.trueCost, and this invoice's profit must not move with it.
    db.prepare(`
      UPDATE sales_invoice_items SET costAtSale = COALESCE(
        (SELECT p.trueCost FROM products p WHERE p.id = sales_invoice_items.productId), 0)
      WHERE invoiceId = ?
    `).run(id);
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
  // A superseded invoice is a frozen audit record: its stock was already reversed
  // and its replacement carries the live sale, so cancelling it would only destroy
  // the trail. Cancel the replacement instead.
  if (inv.status === "amended") {
    return res.status(400).json({ error: "تم تعديل هذه الفاتورة واستبدالها بأخرى — ألغِ الفاتورة الأحدث بدلاً منها" });
  }
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

// ---- Amendment ("تعديل الفاتورة") ---------------------------------------
// The shop regularly needs to add or drop a line after a sale is already closed
// (the customer came back, the craftsman forgot something) without going through
// the returns/exchange flow. Editing a closed invoice in place would silently
// rewrite history that the stock, debt and commission ledgers have already used,
// so instead we SUPERSEDE it: the original's stock goes back, it moves to status
// 'amended' (kept for the record, excluded from every ledger), and a fresh invoice
// carrying the corrected lines takes its place, linked to it both ways.
//
// Money already collected on the original follows the customer to the replacement,
// so the difference is exactly newTotal − oldPaid: positive = the customer owes it,
// negative = the shop owes him. `settlement` decides where that difference lands.
router.post("/sales/:id/amend", (req, res) => {
  const id = Number(req.params.id);
  const prev = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(id) as any;
  if (!prev) return res.status(404).json({ error: "غير موجود" });

  // Only a closed, live invoice can be amended: a draft is still editable in place,
  // and a cancelled or already-superseded one is history.
  if (!["finalized", "partially_paid", "credit", "paid"].includes(prev.status)) {
    return res.status(400).json({
      error: prev.status === "draft"
        ? "الفاتورة مسودة — عدّلها من الكاشير مباشرة"
        : prev.status === "amended"
          ? "تم تعديل هذه الفاتورة بالفعل — عدّل الفاتورة الأحدث"
          : "لا يمكن تعديل فاتورة ملغية",
    });
  }
  if (prev.amendedToId) return res.status(400).json({ error: "تم تعديل هذه الفاتورة بالفعل — عدّل الفاتورة الأحدث" });

  // Same accounting guards as cancel/delete: either would leave a return document
  // or a paid-out commission pointing at lines that no longer exist.
  if (db.prepare("SELECT 1 FROM returns WHERE originalInvoiceId = ?").get(id)) {
    return res.status(400).json({ error: "يوجد مرتجع/استبدال مرتبط بهذه الفاتورة — احذف المرتجعات أولاً" });
  }
  if (prev.commissionPaid > 0.005 || (db.prepare("SELECT COUNT(*) as c FROM craftsman_payout_items WHERE invoiceId = ?").get(id) as any).c > 0) {
    return res.status(400).json({ error: "تم صرف عمولة عن هذه الفاتورة — لا يمكن تعديلها" });
  }

  const { customerId, craftsmanId, discount = 0, notes, items = [], settlement = "cash" } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "الفاتورة المعدّلة لا تحتوي على أصناف" });
  }

  let subtotal = 0;
  for (const item of items) subtotal += Math.max(0, (item.unitPrice * item.quantity) - (item.discount || 0));
  const total = Math.max(0, subtotal - discount);

  const carriedPaid = prev.paidAmount || 0;
  const newCustomerId = customerId || null;

  // A leftover balance in either direction needs a named customer to hang it on —
  // for an anonymous walk-in the money would be owed to nobody.
  if (settlement === "account" && !newCustomerId) {
    return res.status(400).json({ error: "التسوية على الحساب تحتاج فاتورة باسم عميل مسجّل" });
  }

  // 'cash' = the difference changes hands now, so the replacement ends settled.
  // 'account' = only what was already paid carries over; the rest is the balance
  // (negative = credit in the customer's favour).
  const finalPaid = settlement === "account" ? carriedPaid : total;
  const remaining = Math.round((total - finalPaid) * 100) / 100;

  // Derived, not taken from the client, so the label can never contradict the money.
  const paymentType = remaining > 0.005 ? (carriedPaid > 0.005 ? "partial" : "credit") : "cash";
  const status = remaining > 0.005 ? (paymentType === "credit" ? "credit" : "partially_paid") : "finalized";

  let commission = 0;
  if (craftsmanId) {
    const craftsman = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(craftsmanId) as any;
    if (craftsman?.commissionPercent) commission = (total * craftsman.commissionPercent) / 100;
  }

  const s = getSettings();
  const serial = nextSerial(s?.invoicePrefix || "INV");
  const actor = actorName(req);

  let newId = 0;
  db.exec("BEGIN");
  try {
    // 1. Put the original's stock back, documented against the original.
    reverseDocStock("sales_invoice", id, `عكس تعديل فاتورة ${prev.serial}`, actor);

    // 2. The replacement — carrying the original's quotation link forward.
    const r = db.prepare(`
      INSERT INTO sales_invoices (serial, status, paymentType, customerId, craftsmanId, subtotal, discount, total,
                                  paidAmount, remainingAmount, craftsmanCommission, quotationId, amendedFromId, notes, createdBy)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(serial, status, paymentType, newCustomerId, craftsmanId || null, subtotal, discount, total,
      finalPaid, remaining, commission, prev.quotationId || null, id, notes || null, actor);
    newId = r.lastInsertRowid as number;

    // 3. Lines, and the stock they take out, documented against the replacement.
    const insertItem = db.prepare("INSERT INTO sales_invoice_items (invoiceId, productId, quantity, unitPrice, discount, total) VALUES (?,?,?,?,?,?)");
    const updateStock = db.prepare("UPDATE products SET currentStock = currentStock - ?, updatedAt = datetime('now') WHERE id = ?");
    const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes, createdBy) VALUES (?,?,?,?,?,?,?,?,?)");
    for (const item of items) {
      const t = Math.max(0, (item.unitPrice * item.quantity) - (item.discount || 0));
      insertItem.run(newId, item.productId, item.quantity, item.unitPrice, item.discount || 0, t);
      const before = (db.prepare("SELECT currentStock FROM products WHERE id = ?").get(item.productId) as any)?.currentStock || 0;
      updateStock.run(item.quantity, item.productId);
      insertMove.run(item.productId, "sale", item.quantity, before, before - item.quantity, "sales_invoice", newId, `فاتورة ${serial}`, actor);
    }

    // Same cost snapshot the finalize path takes — the replacement is a real sale.
    db.prepare(`
      UPDATE sales_invoice_items SET costAtSale = COALESCE(
        (SELECT p.trueCost FROM products p WHERE p.id = sales_invoice_items.productId), 0)
      WHERE invoiceId = ?
    `).run(newId);

    // 4. Retire the original and point the two at each other.
    db.prepare("UPDATE sales_invoices SET status = 'amended', amendedToId = ?, updatedBy = ?, updatedAt = datetime('now') WHERE id = ?")
      .run(newId, actor, id);

    // 5. A converted quotation must follow the live invoice, otherwise deleting
    //    the superseded one would un-convert a quotation that is still sold.
    db.prepare("UPDATE quotations SET convertedInvoiceId = ? WHERE convertedInvoiceId = ?").run(newId, id);

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.status(201).json({ ...db.prepare(`${INVOICE_SELECT} WHERE si.id = ?`).get(newId), items: getItems(newId) });
  archiveSale(newId).catch((e) => console.error("archive amended sale failed:", e?.message || e));
});

export default router;
