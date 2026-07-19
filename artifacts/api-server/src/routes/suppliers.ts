import { Router } from "express";
import db from "../lib/db.js";
import { actorName } from "../lib/actor.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

const SUPPLIER_SELECT = `
  SELECT s.*,
    COALESCE(s.openingBalance, 0)
      + COALESCE((SELECT SUM(pi.remainingAmount) FROM purchase_invoices pi WHERE pi.supplierId = s.id AND pi.status IN ('finalized','partially_paid','credit')), 0)
      - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplierId = s.id), 0) as totalDebt
  FROM suppliers s
`;

router.get("/suppliers", (req, res) => {
  const { search, isActive } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];
  if (search) {
    conditions.push("(s.name LIKE ? OR s.phone LIKE ? OR s.contactPerson LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  if (isActive !== undefined) { conditions.push("s.isActive = ?"); params.push(isActive === "true" ? 1 : 0); }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${SUPPLIER_SELECT} ${where} ORDER BY s.name`).all(...params);
  res.json({ items, total: items.length });
});

router.post("/suppliers", (req, res) => {
  const { name, phone, address, contactPerson, notes, openingBalance = 0, isActive = true } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare(`
    INSERT INTO suppliers (name, phone, address, contactPerson, notes, openingBalance, isActive)
    VALUES (?,?,?,?,?,?,?)
  `).run(name, phone || null, address || null, contactPerson || null, notes || null, openingBalance, isActive ? 1 : 0);
  res.status(201).json(db.prepare(`${SUPPLIER_SELECT} WHERE s.id = ?`).get(r.lastInsertRowid));
});

router.get("/suppliers/:id", (req, res) => {
  const row = db.prepare(`${SUPPLIER_SELECT} WHERE s.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.patch("/suppliers/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, phone, address, contactPerson, notes, openingBalance, isActive } = req.body;
  db.prepare(`
    UPDATE suppliers SET
    name = COALESCE(?, name), phone = COALESCE(?, phone), address = COALESCE(?, address),
    contactPerson = COALESCE(?, contactPerson), notes = COALESCE(?, notes),
    openingBalance = COALESCE(?, openingBalance),
    isActive = COALESCE(?, isActive), updatedAt = datetime('now')
    WHERE id = ?
  `).run(name || null, phone || null, address || null, contactPerson || null, notes || null,
    openingBalance ?? null, isActive !== undefined ? (isActive ? 1 : 0) : null, id);
  res.json(db.prepare(`${SUPPLIER_SELECT} WHERE s.id = ?`).get(id));
});

// Blocks when there is an unsettled balance with the supplier; hard-deletes when
// no transactions exist, otherwise archives.
router.delete("/suppliers/:id", (req, res) => {
  const err = performDelete("suppliers", Number(req.params.id));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

router.get("/suppliers/:id/payments", (req, res) => {
  res.json(db.prepare("SELECT * FROM supplier_payments WHERE supplierId = ? ORDER BY date DESC").all(Number(req.params.id)));
});

router.post("/suppliers/:id/payments", (req, res) => {
  const id = Number(req.params.id);
  const { amount, date, notes } = req.body;
  if (!amount || !date) return res.status(400).json({ error: "المبلغ والتاريخ مطلوبان" });
  const r = db.prepare("INSERT INTO supplier_payments (supplierId, amount, date, notes, createdBy) VALUES (?,?,?,?,?)").run(id, amount, date, notes || null, actorName(req));
  res.status(201).json(db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(r.lastInsertRowid));
});

export default router;
