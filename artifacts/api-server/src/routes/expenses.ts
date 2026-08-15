import { Router } from "express";
import db from "../lib/db.js";
import { actorName } from "../lib/actor.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

// ---------------------------------------------------------------- dates -----
// Everything here works in LOCAL calendar days. `expenses.date` and `periodKey`
// are plain text (YYYY-MM-DD / YYYY-MM) compared as text, deliberately away from
// the UTC datetimes SQLite writes into createdAt — the shop's "this month" must
// mean the shop's month, not UTC's.

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayLocal = () => localISO(new Date());
const monthStart = () => { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth(), 1)); };
const monthEnd = () => { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)); };
/** 'YYYY-MM' for a date-only string, or for today when omitted. */
const periodOf = (isoDate?: string) => (isoDate || todayLocal()).slice(0, 7);
const currentPeriod = () => periodOf();

/** Day count of the month a 'YYYY-MM' key names. */
function daysInPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).getDate(); // day 0 of the next month = last day of this one
}

/**
 * The calendar date a commitment falls due inside a given month. An agreed pay day
 * of 31 has to land on the 28th/30th in shorter months rather than silently never
 * arriving, so it is clamped to the month's length.
 */
function dueDateOf(period: string, dayOfMonth: number): string {
  const day = Math.min(Math.max(Math.round(dayOfMonth) || 1, 1), daysInPeriod(period));
  return `${period}-${String(day).padStart(2, "0")}`;
}

/** Shift a 'YYYY-MM' key by N months (negative goes back). */
function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const isPeriodKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const isDateKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** How far back an unpaid month keeps nagging. Bounds the work per request and stops
 *  a commitment back-dated by years from generating hundreds of "overdue" rows. */
const MAX_LOOKBACK_MONTHS = 12;

const TYPE_LABELS: Record<string, string> = { salary: "مرتب", rent: "إيجار", other: "مصروف شهري" };
const VALID_TYPES = new Set(["salary", "rent", "other"]);

// ------------------------------------------------------------ due logic -----

export interface DueEntry {
  recurringExpenseId: number;
  name: string;
  type: string;
  typeLabel: string;
  jobTitle: string | null;
  amount: number;
  periodKey: string;
  dueDate: string;
  /** overdue = an earlier month never got paid · due = payable today · soon = within
   *  DUE_SOON_DAYS · upcoming = later this month. Paid months are not returned. */
  status: "overdue" | "due" | "soon" | "upcoming";
}

const DUE_SOON_DAYS = 5;

/** Whole days from `a` to `b`, both local YYYY-MM-DD. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Every month a live commitment owes but hasn't been paid for, from the month it
 * started (capped at MAX_LOOKBACK_MONTHS back) through the current month.
 *
 * A commitment is "paid" for a month when an `expenses` row carries its id and that
 * periodKey — the same link the payment endpoint writes — so deleting that payment
 * makes the month due again on its own, with no extra state to keep in sync.
 */
function pendingFor(row: any, today = todayLocal()): DueEntry[] {
  const nowPeriod = periodOf(today);
  // Derived from `today` (not the wall clock) so the whole function is a pure
  // function of its inputs.
  const floor = shiftPeriod(nowPeriod, -MAX_LOOKBACK_MONTHS);

  // Start from the commitment's own start (or when it was registered), never earlier
  // than the lookback floor — a back-dated startDate shouldn't invoice the past.
  const startedAt = isDateKey(row.startDate) ? row.startDate : String(row.createdAt || today).slice(0, 10);
  let period = periodOf(startedAt);
  if (period < floor) period = floor;

  const paidRows = db
    .prepare("SELECT periodKey FROM expenses WHERE recurringExpenseId = ? AND periodKey IS NOT NULL")
    .all(row.id) as any[];
  const paid = new Set(paidRows.map((r) => r.periodKey));

  const out: DueEntry[] = [];
  for (; period <= nowPeriod; period = shiftPeriod(period, 1)) {
    if (paid.has(period)) continue;
    const dueDate = dueDateOf(period, row.dayOfMonth);
    // A commitment that started mid-month doesn't owe that month if its pay day had
    // already passed when it was registered.
    if (dueDate < startedAt) continue;

    const gap = daysBetween(today, dueDate); // negative = the date has passed
    const status: DueEntry["status"] =
      period < nowPeriod ? "overdue" : gap <= 0 ? "due" : gap <= DUE_SOON_DAYS ? "soon" : "upcoming";

    out.push({
      recurringExpenseId: row.id,
      name: row.name,
      type: row.type,
      typeLabel: TYPE_LABELS[row.type] || TYPE_LABELS.other,
      jobTitle: row.jobTitle ?? null,
      amount: row.amount,
      periodKey: period,
      dueDate,
      status,
    });
  }
  return out;
}

/** Pending entries across every active commitment, oldest first. */
function allPending(): DueEntry[] {
  const rows = db.prepare("SELECT * FROM recurring_expenses WHERE isActive = 1").all() as any[];
  const today = todayLocal();
  return rows
    .flatMap((r) => pendingFor(r, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * "Actionable now" — everything except a month that simply hasn't reached its pay
 * day yet. Defined ONCE here so the row badge, the page's alert strip and the
 * dashboard banner can never quote three different numbers for the same backlog.
 */
const isActionable = (p: DueEntry) => p.status !== "upcoming";

/** The single entry a list row shows: what this commitment owes right now, if anything. */
function currentStatusOf(row: any, today = todayLocal()) {
  const pending = pendingFor(row, today);
  const period = periodOf(today);
  const paidThisMonth = !pending.some((p) => p.periodKey === period);
  const actionable = pending.filter(isActionable);
  // The oldest unpaid month is what the shop should act on first.
  const next = pending[0] || null;
  return {
    paidCurrentPeriod: paidThisMonth,
    currentPeriod: period,
    currentDueDate: dueDateOf(period, row.dayOfMonth),
    // Every unpaid month, including one not yet at its pay day (drives "can I pay?").
    pendingCount: pending.length,
    pendingTotal: Math.round(pending.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    // Only what is actually owed today (drives every alert count and total).
    dueCount: actionable.length,
    dueTotal: Math.round(actionable.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    nextDuePeriod: next?.periodKey ?? null,
    nextDueDate: next?.dueDate ?? null,
    status: next?.status ?? "paid",
  };
}

// -------------------------------------------------------- expenses log -----

const EXPENSE_SELECT = `
  SELECT e.*, re.name as recurringName, re.type as recurringType, re.jobTitle as recurringJobTitle
  FROM expenses e
  LEFT JOIN recurring_expenses re ON e.recurringExpenseId = re.id
`;

// NOTE: defined BEFORE /expenses/:id — Express matches in registration order, so a
// literal segment registered after the param route would be swallowed by it.
router.get("/expenses/due-summary", (_req, res) => {
  const pending = allPending();
  const actionable = pending.filter(isActionable);
  const monthTotal = (db
    .prepare("SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE date BETWEEN ? AND ?")
    .get(monthStart(), monthEnd()) as any).v || 0;

  res.json({
    dueCount: actionable.length,
    dueTotal: Math.round(actionable.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    overdueCount: pending.filter((p) => p.status === "overdue").length,
    monthTotal: Math.round(monthTotal * 100) / 100,
    items: actionable,
  });
});

router.get("/expenses", (req, res) => {
  const { search, dateFrom, dateTo, recurringId, limit = 100, offset = 0 } = req.query as any;
  // Default to the current month so the page opens on "what did I spend this month".
  const from = isDateKey(dateFrom) ? dateFrom : monthStart();
  const to = isDateKey(dateTo) ? dateTo : monthEnd();

  const conditions = ["e.date BETWEEN ? AND ?"];
  const params: any[] = [from, to];

  if (search) {
    conditions.push("(e.description LIKE ? OR e.category LIKE ? OR e.notes LIKE ? OR re.name LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (recurringId) { conditions.push("e.recurringExpenseId = ?"); params.push(Number(recurringId)); }

  const where = "WHERE " + conditions.join(" AND ");
  const items = db.prepare(`${EXPENSE_SELECT} ${where} ORDER BY e.date DESC, e.id DESC LIMIT ? OFFSET ?`)
    .all(...params, Number(limit), Number(offset));
  // Totals cover the whole filtered range, not just the returned page.
  const agg = db.prepare(`
    SELECT COUNT(*) as c, COALESCE(SUM(e.amount), 0) as v
    FROM expenses e LEFT JOIN recurring_expenses re ON e.recurringExpenseId = re.id ${where}
  `).get(...params) as any;

  res.json({
    items,
    total: agg.c,
    totalAmount: Math.round((agg.v || 0) * 100) / 100,
    dateFrom: from,
    dateTo: to,
  });
});

router.post("/expenses", (req, res) => {
  const { amount, description, category, date, notes } = req.body || {};
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "المبلغ مطلوب ولازم يكون أكبر من صفر" });
  if (!description || !String(description).trim()) return res.status(400).json({ error: "اكتب المصروف ده في إيه" });
  const day = isDateKey(date) ? date : todayLocal();

  const r = db.prepare(`
    INSERT INTO expenses (amount, description, category, date, notes, createdBy) VALUES (?,?,?,?,?,?)
  `).run(value, String(description).trim(), category?.trim() || null, day, notes?.trim() || null, actorName(req));
  res.status(201).json(db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(r.lastInsertRowid));
});

router.get("/expenses/:id", (req, res) => {
  const row = db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.patch("/expenses/:id", (req, res) => {
  const id = Number(req.params.id);
  const prev = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as any;
  if (!prev) return res.status(404).json({ error: "غير موجود" });

  const { amount, description, category, date, notes } = req.body || {};
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
    return res.status(400).json({ error: "المبلغ لازم يكون أكبر من صفر" });
  }
  if (description !== undefined && !String(description).trim()) return res.status(400).json({ error: "اكتب المصروف ده في إيه" });
  if (date !== undefined && !isDateKey(date)) return res.status(400).json({ error: "تاريخ غير صالح" });

  // The commitment link (recurringExpenseId/periodKey) is deliberately NOT editable:
  // moving a salary payment to another month by hand would let the same month be paid
  // twice from two directions. Delete and re-pay instead.
  // `category`/`notes` are set outright (not COALESCEd) so they can be CLEARED — the
  // same trap products PATCH had to fix.
  db.prepare(`
    UPDATE expenses SET amount = ?, description = ?, category = ?, date = ?, notes = ? WHERE id = ?
  `).run(
    amount !== undefined ? Number(amount) : prev.amount,
    description !== undefined ? String(description).trim() : prev.description,
    category !== undefined ? (category?.trim() || null) : prev.category,
    date !== undefined ? date : prev.date,
    notes !== undefined ? (notes?.trim() || null) : prev.notes,
    id,
  );
  res.json(db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(id));
});

router.delete("/expenses/:id", (req, res) => {
  const err = performDelete("expenses", Number(req.params.id), actorName(req));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

// --------------------------------------------------- monthly commitments ----

/** A commitment plus its live due state — what every list/detail response returns. */
function withStatus(row: any) {
  return { ...row, ...currentStatusOf(row) };
}

router.get("/recurring-expenses", (req, res) => {
  const { isActive, search } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(name LIKE ? OR jobTitle LIKE ? OR notes LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  // Archived commitments are hidden by default — same promise the delete dialog makes
  // for products/customers/suppliers.
  if (isActive !== undefined) { conditions.push("isActive = ?"); params.push(isActive === "true" ? 1 : 0); }
  else { conditions.push("isActive = 1"); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const rows = db.prepare(`SELECT * FROM recurring_expenses ${where} ORDER BY isActive DESC, dayOfMonth, name`).all(...params) as any[];
  const items = rows.map(withStatus);
  res.json({ items, total: items.length });
});

function readCommitment(body: any) {
  const type = VALID_TYPES.has(body?.type) ? body.type : "other";
  return {
    name: String(body?.name || "").trim(),
    type,
    // The job title only means anything for a person on the payroll.
    jobTitle: type === "salary" ? (body?.jobTitle?.trim() || null) : null,
    phone: body?.phone?.trim() || null,
    amount: Number(body?.amount),
    dayOfMonth: Math.min(Math.max(Math.round(Number(body?.dayOfMonth)) || 1, 1), 31),
    startDate: isDateKey(body?.startDate) ? body.startDate : todayLocal(),
    notes: body?.notes?.trim() || null,
  };
}

router.post("/recurring-expenses", (req, res) => {
  const c = readCommitment(req.body);
  if (!c.name) return res.status(400).json({ error: "الاسم مطلوب" });
  if (!Number.isFinite(c.amount) || c.amount <= 0) return res.status(400).json({ error: "المبلغ الشهري مطلوب ولازم يكون أكبر من صفر" });

  const r = db.prepare(`
    INSERT INTO recurring_expenses (name, type, jobTitle, phone, amount, dayOfMonth, startDate, notes, createdBy)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(c.name, c.type, c.jobTitle, c.phone, c.amount, c.dayOfMonth, c.startDate, c.notes, actorName(req));

  res.status(201).json(withStatus(db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(r.lastInsertRowid)));
});

router.get("/recurring-expenses/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(withStatus(row));
});

router.patch("/recurring-expenses/:id", (req, res) => {
  const id = Number(req.params.id);
  const prev = db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(id) as any;
  if (!prev) return res.status(404).json({ error: "غير موجود" });

  const { name, type, jobTitle, phone, amount, dayOfMonth, startDate, notes, isActive } = req.body || {};
  if (name !== undefined && !String(name).trim()) return res.status(400).json({ error: "الاسم مطلوب" });
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) {
    return res.status(400).json({ error: "المبلغ الشهري لازم يكون أكبر من صفر" });
  }
  if (type !== undefined && !VALID_TYPES.has(type)) return res.status(400).json({ error: "نوع غير معروف" });
  if (startDate !== undefined && !isDateKey(startDate)) return res.status(400).json({ error: "تاريخ بداية غير صالح" });

  const nextType = type ?? prev.type;
  // Switching away from a salary clears the job title so a stale «سباك» can't linger
  // on what is now the rent.
  const nextJobTitle = nextType === "salary"
    ? (jobTitle !== undefined ? (jobTitle?.trim() || null) : prev.jobTitle)
    : null;

  db.prepare(`
    UPDATE recurring_expenses SET
      name = COALESCE(?, name), type = ?, jobTitle = ?, phone = ?,
      amount = COALESCE(?, amount), dayOfMonth = COALESCE(?, dayOfMonth),
      startDate = COALESCE(?, startDate), notes = ?, isActive = COALESCE(?, isActive),
      updatedAt = datetime('now')
    WHERE id = ?
  `).run(
    name !== undefined ? String(name).trim() : null,
    nextType,
    nextJobTitle,
    phone !== undefined ? (phone?.trim() || null) : prev.phone,
    amount !== undefined ? Number(amount) : null,
    dayOfMonth !== undefined ? Math.min(Math.max(Math.round(Number(dayOfMonth)) || 1, 1), 31) : null,
    startDate !== undefined ? startDate : null,
    notes !== undefined ? (notes?.trim() || null) : prev.notes,
    isActive !== undefined ? (isActive ? 1 : 0) : null,
    id,
  );

  res.json(withStatus(db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(id)));
});

router.delete("/recurring-expenses/:id", (req, res) => {
  const err = performDelete("recurring-expenses", Number(req.params.id), actorName(req));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

/** Every month this commitment still owes — drives the alert strip on its row. */
router.get("/recurring-expenses/:id/pending", (req, res) => {
  const row = db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(Number(req.params.id)) as any;
  if (!row) return res.status(404).json({ error: "غير موجود" });
  const items = row.isActive ? pendingFor(row) : [];
  res.json({ items, total: items.length });
});

/**
 * Record that a monthly commitment was paid for a given month. This writes an
 * ordinary `expenses` row carrying the link back, which is what makes the month
 * stop being due — and what puts the salary into the shop's expense total for the
 * month alongside every ad-hoc expense.
 */
router.post("/recurring-expenses/:id/pay", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM recurring_expenses WHERE id = ?").get(id) as any;
  if (!row) return res.status(404).json({ error: "غير موجود" });
  if (!row.isActive) return res.status(400).json({ error: "الالتزام ده مؤرشف — فعّله الأول قبل الصرف" });

  const { amount, date, periodKey, notes } = req.body || {};
  const value = amount !== undefined ? Number(amount) : row.amount;
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: "المبلغ لازم يكون أكبر من صفر" });

  const period = isPeriodKey(periodKey) ? periodKey : currentPeriod();
  if (period > currentPeriod()) return res.status(400).json({ error: "مش ممكن تصرف شهر لسه ما جاش" });
  // A month before the commitment even started was never owed, so a payment against
  // it would sit in the ledger clearing nothing.
  const startPeriod = periodOf(isDateKey(row.startDate) ? row.startDate : String(row.createdAt || "").slice(0, 10));
  if (startPeriod && period < startPeriod) {
    return res.status(400).json({ error: `«${row.name}» بدأ من ${startPeriod} — مفيش استحقاق على شهر ${period}` });
  }
  const day = isDateKey(date) ? date : todayLocal();

  if (db.prepare("SELECT 1 FROM expenses WHERE recurringExpenseId = ? AND periodKey = ?").get(id, period)) {
    return res.status(400).json({ error: `«${row.name}» متصرفله شهر ${period} بالفعل` });
  }

  const label = TYPE_LABELS[row.type] || TYPE_LABELS.other;
  const description = `${label} ${row.name} — ${period}`;

  try {
    const r = db.prepare(`
      INSERT INTO expenses (amount, description, category, date, notes, recurringExpenseId, periodKey, createdBy)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(value, description, label, day, notes?.trim() || null, id, period, actorName(req));
    res.status(201).json(db.prepare(`${EXPENSE_SELECT} WHERE e.id = ?`).get(r.lastInsertRowid));
  } catch (e: any) {
    // The partial UNIQUE index is the real guard — the check above just gives a nicer
    // message. A concurrent second request lands here instead of leaking a 500.
    if (String(e?.message || "").includes("UNIQUE")) {
      return res.status(400).json({ error: `«${row.name}» متصرفله شهر ${period} بالفعل` });
    }
    throw e;
  }
});

export default router;
