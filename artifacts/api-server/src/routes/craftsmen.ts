import { Router } from "express";
import db from "../lib/db.js";
import { actorName } from "../lib/actor.js";
import { nextPayoutSerial } from "../lib/db.js";
import { archivePayout } from "../lib/archive.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

// Commission a craftsman has earned but not yet been paid out:
// sum over his finalized invoices of (commission earned − commission already paid).
const OUTSTANDING_SUBQUERY = `
  COALESCE((SELECT SUM(si.craftsmanCommission - si.commissionPaid)
            FROM sales_invoices si
            WHERE si.craftsmanId = cr.id AND si.status NOT IN ('draft','cancelled')), 0)`;
const PAID_SUBQUERY = `
  COALESCE((SELECT SUM(si.commissionPaid)
            FROM sales_invoices si
            WHERE si.craftsmanId = cr.id AND si.status NOT IN ('draft','cancelled')), 0)`;

router.get("/craftsmen", (req, res) => {
  const { search, isActive } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(cr.name LIKE ? OR cr.phone LIKE ? OR cr.jobType LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  // Archived craftsmen hidden by default (matches the delete "إخفاء" promise).
  if (isActive !== undefined) { conditions.push("cr.isActive = ?"); params.push(isActive === "true" ? 1 : 0); }
  else { conditions.push("cr.isActive = 1"); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`
    SELECT cr.*,
      COALESCE((SELECT SUM(si.total) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalSales,
      COALESCE((SELECT SUM(si.craftsmanCommission) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.status != 'draft' AND si.status != 'cancelled'), 0) as totalCommission,
      ${PAID_SUBQUERY} as paidCommission,
      ${OUTSTANDING_SUBQUERY} as outstandingCommission
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
      ${PAID_SUBQUERY} as paidCommission,
      ${OUTSTANDING_SUBQUERY} as outstandingCommission,
      COALESCE((SELECT COUNT(DISTINCT si.customerId) FROM sales_invoices si WHERE si.craftsmanId = cr.id AND si.customerId IS NOT NULL AND si.status != 'draft'), 0) as uniqueCustomers,
      COALESCE((SELECT COUNT(*) FROM quotations q WHERE q.craftsmanId = cr.id), 0) as totalQuotations
    FROM craftsmen cr WHERE cr.id = ?
  `).get(id);
  if (!row) return res.status(404).json({ error: "غير موجود" });

  const recentPayouts = db.prepare(`
    SELECT id, serial, amount, notes, createdBy, createdAt FROM craftsman_payouts
    WHERE craftsmanId = ? ORDER BY createdAt DESC LIMIT 50
  `).all(id);

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

  res.json({ ...row as any, recentSales, recentQuotations, recentPayouts });
});

router.get("/craftsmen/:id/customers", (req, res) => {
  const id = Number(req.params.id);
  // Use correlated subqueries (not a dual LEFT JOIN) so the invoice aggregates
  // are not multiplied by the number of matching quotations and vice-versa.
  const customers = db.prepare(`
    SELECT
      c.id, c.name, c.phone, c.area,
      (SELECT COUNT(*) FROM sales_invoices si WHERE si.customerId = c.id AND si.craftsmanId = ? AND si.status != 'draft') as invoiceCount,
      (SELECT COALESCE(SUM(si.total), 0) FROM sales_invoices si WHERE si.customerId = c.id AND si.craftsmanId = ? AND si.status != 'draft') as totalSales,
      (SELECT COALESCE(SUM(si.remainingAmount), 0) FROM sales_invoices si WHERE si.customerId = c.id AND si.craftsmanId = ? AND si.status IN ('finalized','partially_paid','credit','paid')) as totalRemaining,
      (SELECT MAX(si.createdAt) FROM sales_invoices si WHERE si.customerId = c.id AND si.craftsmanId = ? AND si.status != 'draft') as lastInvoiceDate,
      (SELECT COUNT(*) FROM quotations q WHERE q.customerId = c.id AND q.craftsmanId = ?) as quotationCount
    FROM customers c
    WHERE EXISTS (SELECT 1 FROM sales_invoices si WHERE si.customerId = c.id AND si.craftsmanId = ? AND si.status != 'draft')
       OR EXISTS (SELECT 1 FROM quotations q WHERE q.customerId = c.id AND q.craftsmanId = ?)
    ORDER BY totalSales DESC
  `).all(id, id, id, id, id, id, id);
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

// Blocks when unpaid commission is outstanding; hard-deletes when he has no
// transactions at all, otherwise archives (keeps the commission history).
router.delete("/craftsmen/:id", (req, res) => {
  const err = performDelete("craftsmen", Number(req.params.id));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

// ---- Commission payouts -------------------------------------------------

// Outstanding commission for one craftsman (earned − already paid).
function outstandingFor(id: number): number {
  const r = db.prepare(`
    SELECT COALESCE(SUM(craftsmanCommission - commissionPaid), 0) as v
    FROM sales_invoices WHERE craftsmanId = ? AND status NOT IN ('draft','cancelled')
  `).get(id) as any;
  return r?.v || 0;
}

// Full receipt for a payout: the payout + craftsman header + the invoices it settled.
function payoutReceipt(payoutId: number) {
  const payout = db.prepare(`
    SELECT p.*, cr.name as craftsmanName, cr.phone as craftsmanPhone,
           cr.jobType as craftsmanJobType, cr.commissionPercent
    FROM craftsman_payouts p JOIN craftsmen cr ON p.craftsmanId = cr.id
    WHERE p.id = ?
  `).get(payoutId) as any;
  if (!payout) return null;
  const items = db.prepare(`
    SELECT pii.invoiceId, pii.amount, si.serial, si.total as invoiceTotal,
           si.craftsmanCommission as invoiceCommission, si.createdAt, c.name as customerName
    FROM craftsman_payout_items pii
    JOIN sales_invoices si ON pii.invoiceId = si.id
    LEFT JOIN customers c ON si.customerId = c.id
    WHERE pii.payoutId = ? ORDER BY si.createdAt
  `).all(payoutId);
  return { ...payout, items };
}

// Pay out commission. Amount is optional → defaults to the full outstanding.
// Allocates the amount across the craftsman's unsettled invoices, oldest first.
router.post("/craftsmen/:id/payouts", (req, res) => {
  const id = Number(req.params.id);
  const craftsman = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(id) as any;
  if (!craftsman) return res.status(404).json({ error: "غير موجود" });

  const outstanding = outstandingFor(id);
  // Compare against the 2-decimal-rounded outstanding so a full withdrawal of a
  // fractional balance (e.g. 33.333) isn't rejected for being a hair over.
  const cap = Math.round(outstanding * 100) / 100;
  const isFull = req.body?.amount == null;
  let amount = isFull ? cap : Number(req.body.amount);
  amount = Math.round(amount * 100) / 100;
  const { notes } = req.body || {};

  if (!(amount > 0)) return res.status(400).json({ error: "المبلغ لازم يكون أكبر من صفر" });
  if (amount > cap + 0.001) return res.status(400).json({ error: "المبلغ أكبر من العمولة المستحقة" });

  db.exec("BEGIN");
  try {
    const r = db.prepare(
      "INSERT INTO craftsman_payouts (serial, craftsmanId, amount, notes, createdBy) VALUES (?,?,?,?,?)",
    ).run(nextPayoutSerial(), id, amount, notes || null, actorName(req));
    const payoutId = r.lastInsertRowid as number;

    // FIFO: settle the oldest invoices first.
    const unsettled = db.prepare(`
      SELECT id, (craftsmanCommission - commissionPaid) as due
      FROM sales_invoices
      WHERE craftsmanId = ? AND status NOT IN ('draft','cancelled')
        AND (craftsmanCommission - commissionPaid) > 0.001
      ORDER BY createdAt ASC, id ASC
    `).all(id) as any[];

    const addItem = db.prepare("INSERT INTO craftsman_payout_items (payoutId, invoiceId, amount) VALUES (?,?,?)");
    const bumpPaid = db.prepare("UPDATE sales_invoices SET commissionPaid = commissionPaid + ? WHERE id = ?");
    let remaining = amount;
    for (const inv of unsettled) {
      if (remaining <= 0.001) break;
      // On a full payout, let the last touched invoice absorb sub-cent rounding
      // residue so commissionPaid ends exactly equal to craftsmanCommission.
      const alloc = isFull ? inv.due : Math.min(remaining, inv.due);
      addItem.run(payoutId, inv.id, alloc);
      bumpPaid.run(alloc, inv.id);
      remaining -= alloc;
    }
    db.exec("COMMIT");
    res.status(201).json(payoutReceipt(payoutId));
    // Auto-archive a PDF of the commission payout (best-effort).
    archivePayout(payoutId).catch((e) => console.error("archive payout failed:", e?.message || e));
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});

router.get("/craftsmen/:id/payouts", (req, res) => {
  const id = Number(req.params.id);
  const items = db.prepare(
    "SELECT id, serial, amount, notes, createdBy, createdAt FROM craftsman_payouts WHERE craftsmanId = ? ORDER BY createdAt DESC",
  ).all(id);
  res.json({ items, total: items.length });
});

router.get("/craftsman-payouts/:payoutId", (req, res) => {
  const receipt = payoutReceipt(Number(req.params.payoutId));
  if (!receipt) return res.status(404).json({ error: "غير موجود" });
  res.json(receipt);
});

export default router;
