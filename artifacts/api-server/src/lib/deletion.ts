import db from "./db.js";

/**
 * Centralized, accounting-aware deletion for every entity in the system.
 *
 * Both the preview endpoint (GET /delete-preview/:entity/:id) and the actual
 * DELETE handlers use THIS module, so what the confirmation dialog promises is
 * exactly what gets executed:
 *  - effects:  what WILL happen (stock restored, debt removed, links cleared…)
 *  - warnings: irreversible side notes (cash already moved hands, cost stays…)
 *  - blockers: accounting reasons the delete is refused (linked returns,
 *              paid-out commission, outstanding balance, referenced records…)
 *
 * Stock reversal uses stock_movements (balanceAfter − balanceBefore per product
 * for the document) as the source of truth — not the document items — so it is
 * correct for every status (draft never moved stock, finalized did, a cancelled
 * invoice that had been finalized first still did).
 */

export interface DeletePreview {
  canDelete: boolean;
  /** hard = row is removed; archive = row is kept but deactivated (isActive=0). */
  mode: "hard" | "archive";
  effects: string[];
  warnings: string[];
  blockers: string[];
}

const money = (n: number) => `${Number((Math.round(n * 100) / 100).toFixed(2)).toLocaleString("en-US")} ج.م`;
const qty = (n: number) => Number(n.toFixed(3)).toString();

/** Net stock delta per product caused by a document (from its stock movements). */
function docStockDeltas(refType: string, refId: number) {
  return db.prepare(`
    SELECT sm.productId, SUM(sm.balanceAfter - sm.balanceBefore) as delta,
           p.nameAr as name, p.currentStock, u.name as unitName
    FROM stock_movements sm
    LEFT JOIN products p ON p.id = sm.productId
    LEFT JOIN units u ON p.unitId = u.id
    WHERE sm.referenceType = ? AND sm.referenceId = ?
    GROUP BY sm.productId
    HAVING ABS(SUM(sm.balanceAfter - sm.balanceBefore)) > 0.0001
  `).all(refType, refId) as any[];
}

/** Insert reversal stock movements + apply the stock change for a deleted document. */
export function reverseDocStock(refType: string, refId: number, note: string, actor?: string | null) {
  const deltas = docStockDeltas(refType, refId);
  const upd = db.prepare("UPDATE products SET currentStock = currentStock - ?, updatedAt = datetime('now') WHERE id = ?");
  const ins = db.prepare(
    "INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes, createdBy) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const d of deltas) {
    const before = (db.prepare("SELECT currentStock FROM products WHERE id = ?").get(d.productId) as any)?.currentStock || 0;
    upd.run(d.delta, d.productId); // subtracting the original delta reverses it
    ins.run(d.productId, "adjustment", Math.abs(d.delta), before, before - d.delta, refType, refId, note, actor || null);
  }
}

const unitSuffix = (u?: string | null) => (u ? ` ${u}` : "");

// Held cashier/quotation drafts store their cart as JSON in `drafts.data` (no real
// FK). A product/customer sitting in a draft must not be HARD-deleted, or resuming
// that draft and finalizing it would hit a products/customers FK violation. Archiving
// keeps the row (FK-safe), so we treat a draft reference as "has history".
function draftReferencesProduct(productId: number): boolean {
  const rows = db.prepare("SELECT data FROM drafts").all() as any[];
  for (const r of rows) {
    try {
      const cart = JSON.parse(r.data || "{}")?.cart;
      if (Array.isArray(cart) && cart.some((it: any) => Number(it?.productId) === productId)) return true;
    } catch { /* ignore malformed draft */ }
  }
  return false;
}
function draftReferencesCustomer(customerId: number): boolean {
  const rows = db.prepare("SELECT data FROM drafts").all() as any[];
  for (const r of rows) {
    try {
      if (Number(JSON.parse(r.data || "{}")?.customerId) === customerId) return true;
    } catch { /* ignore malformed draft */ }
  }
  return false;
}

// ---------------------------------------------------------------- sales -----

function previewSales(id: number): DeletePreview | null {
  const inv = db.prepare(`
    SELECT si.*, c.name as customerName, cr.name as craftsmanName, q.serial as quotationSerial
    FROM sales_invoices si
    LEFT JOIN customers c ON si.customerId = c.id
    LEFT JOIN craftsmen cr ON si.craftsmanId = cr.id
    LEFT JOIN quotations q ON si.quotationId = q.id
    WHERE si.id = ?
  `).get(id) as any;
  if (!inv) return null;

  const effects: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Blocker: returns/exchanges reference this invoice (their stock and account
  // effects are anchored to it — deleting underneath them corrupts the books).
  const linkedReturns = db.prepare("SELECT serial FROM returns WHERE originalInvoiceId = ?").all(id) as any[];
  if (linkedReturns.length) {
    blockers.push(
      `يوجد ${linkedReturns.length} مرتجع/استبدال مرتبط بهذه الفاتورة (${linkedReturns.map((r) => r.serial).join("، ")}) — يجب حذف المرتجعات أولاً من شاشة المرتجعات`,
    );
  }

  // Blocker: commission already paid out against this invoice (payout receipts
  // reference it via craftsman_payout_items; deleting would falsify the payout
  // record AND hit the FK constraint). Check row existence too — a rounded-tiny
  // commissionPaid could slip under the threshold while a real payout row exists.
  const payoutRefs = (db.prepare("SELECT COUNT(*) as c FROM craftsman_payout_items WHERE invoiceId = ?").get(id) as any).c as number;
  if (payoutRefs > 0 || inv.commissionPaid > 0.005) {
    blockers.push(
      `تم صرف عمولة ${money(inv.commissionPaid)} للصنايعي «${inv.craftsmanName || ""}» عن هذه الفاتورة ضمن سند صرف — لا يمكن الحذف حفاظاً على سجل الصرف`,
    );
  }

  // Stock: from actual movements, so drafts (no movements) show no stock effect.
  const deltas = docStockDeltas("sales_invoice", id);
  for (const d of deltas) {
    const restored = -d.delta; // sale deltas are negative → restoring adds
    effects.push(
      `إرجاع ${qty(restored)}${unitSuffix(d.unitName)} من «${d.name}» إلى المخزن (المخزون: ${qty(d.currentStock)} ← ${qty(d.currentStock + restored)})`,
    );
  }
  if (!deltas.length) effects.push("لا تأثير على المخزون — هذه الفاتورة لم تخصم مخزوناً (مسودة/ملغية بدون إنجاز)");

  if (inv.customerId && inv.remainingAmount > 0.005 && ["finalized", "partially_paid", "credit", "paid"].includes(inv.status)) {
    effects.push(`إلغاء مديونية على العميل «${inv.customerName}» بقيمة ${money(inv.remainingAmount)} (سينخفض رصيده المدين)`);
    // If account payments already covered this debt, removing it flips the
    // customer to a credit balance — warn so the owner reviews the payments first.
    const after = customerDebt(inv.customerId) - inv.remainingAmount;
    if (after < -0.005) {
      warnings.push(`حساب العميل «${inv.customerName}» هيبقى دائن بقيمة ${money(-after)} بعد الحذف — سبق تحصيل دفعات على الحساب تغطي هذه المديونية؛ راجع الدفعات قبل الحذف`);
    }
  }
  if (inv.paidAmount > 0.005) {
    warnings.push(
      `سبق تحصيل ${money(inv.paidAmount)} نقداً على هذه الفاتورة — الحذف يزيل أثرها من التقارير وكشف حساب العميل، ولا يعيد النقدية تلقائياً`,
    );
  }
  if (inv.craftsmanCommission > 0.005 && inv.commissionPaid <= 0.005 && !["draft", "cancelled"].includes(inv.status)) {
    effects.push(`إلغاء عمولة مستحقة (غير مصروفة) للصنايعي «${inv.craftsmanName}» بقيمة ${money(inv.craftsmanCommission)}`);
  }
  if (inv.quotationId) {
    effects.push(`فك ارتباط التسعيرة ${inv.quotationSerial || `#${inv.quotationId}`} وإعادتها لحالة «مؤكدة» بحيث يمكن تحويلها من جديد`);
  }
  effects.push("حذف الفاتورة وبنودها نهائياً، مع تسجيل حركات مخزون عكسية موثقة برقم الفاتورة");

  return { canDelete: blockers.length === 0, mode: "hard", effects, warnings, blockers };
}

function deleteSales(id: number, actor?: string | null): string | null {
  const p = previewSales(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  const inv = db.prepare("SELECT serial, quotationId FROM sales_invoices WHERE id = ?").get(id) as any;
  db.exec("BEGIN");
  try {
    reverseDocStock("sales_invoice", id, `عكس حذف فاتورة ${inv.serial}`, actor);
    // Un-convert the linked quotation (link exists on both sides).
    db.prepare(
      "UPDATE quotations SET status = 'confirmed', convertedInvoiceId = NULL, updatedBy = ?, updatedAt = datetime('now') WHERE convertedInvoiceId = ? OR id = ?",
    ).run(actor || null, id, inv.quotationId || -1);
    db.prepare("DELETE FROM sales_invoices WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return null;
}

// ------------------------------------------------------------- purchases ----

function previewPurchase(id: number): DeletePreview | null {
  const pur = db.prepare(`
    SELECT pi.*, s.name as supplierName FROM purchase_invoices pi
    LEFT JOIN suppliers s ON pi.supplierId = s.id WHERE pi.id = ?
  `).get(id) as any;
  if (!pur) return null;

  const effects: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const deltas = docStockDeltas("purchase_invoice", id);
  for (const d of deltas) {
    const removed = d.delta; // purchase deltas are positive → reversing subtracts
    const after = d.currentStock - removed;
    effects.push(
      `خصم ${qty(removed)}${unitSuffix(d.unitName)} من «${d.name}» من المخزن (المخزون: ${qty(d.currentStock)} ← ${qty(after)})`,
    );
    if (after < -0.0001) {
      warnings.push(`مخزون «${d.name}» سيصبح سالباً (${qty(after)}) — تم بيع جزء من الكمية المستلمة بهذه الفاتورة`);
    }
  }
  if (!deltas.length) effects.push("لا تأثير على المخزون — هذه الفاتورة لم تُضِف مخزوناً (مسودة/ملغية بدون إنجاز)");

  if (pur.supplierId && pur.remainingAmount > 0.005 && ["finalized", "partially_paid", "credit"].includes(pur.status)) {
    effects.push(`إلغاء مديونية للمورد «${pur.supplierName}» بقيمة ${money(pur.remainingAmount)} (سينخفض حسابه الدائن)`);
  }
  if (pur.paidAmount > 0.005) {
    warnings.push(
      `سبق دفع ${money(pur.paidAmount)} للمورد على هذه الفاتورة — الحذف يزيل أثرها من حساب المورد والتقارير، ولا يسترد النقدية`,
    );
  }
  if (deltas.length) {
    const touchedCost = db.prepare(
      "SELECT COUNT(*) as c FROM purchase_invoice_items WHERE purchaseId = ? AND trueCost > 0",
    ).get(id) as any;
    if (touchedCost?.c) {
      warnings.push("تكلفة الشراء المسجلة على المنتجات (التي حُدّثت عند إنجاز الفاتورة) ستبقى كما هي ولن تعود للتكلفة السابقة");
    }
  }
  effects.push("حذف فاتورة المشتريات وبنودها نهائياً، مع تسجيل حركات مخزون عكسية موثقة برقم الفاتورة");

  return { canDelete: blockers.length === 0, mode: "hard", effects, warnings, blockers };
}

function deletePurchase(id: number, actor?: string | null): string | null {
  const p = previewPurchase(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  const pur = db.prepare("SELECT serial FROM purchase_invoices WHERE id = ?").get(id) as any;
  db.exec("BEGIN");
  try {
    reverseDocStock("purchase_invoice", id, `عكس حذف فاتورة مشتريات ${pur.serial}`, actor);
    db.prepare("DELETE FROM purchase_invoices WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return null;
}

// --------------------------------------------------------------- returns ----

function previewReturn(id: number): DeletePreview | null {
  const ret = db.prepare(`
    SELECT r.*, c.name as customerName FROM returns r
    LEFT JOIN customers c ON r.customerId = c.id WHERE r.id = ?
  `).get(id) as any;
  if (!ret) return null;

  const effects: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const deltas = docStockDeltas("return", id);
  for (const d of deltas) {
    if (d.delta > 0) {
      // Returned items that were restocked → pull them back out.
      const after = d.currentStock - d.delta;
      effects.push(
        `سحب ${qty(d.delta)}${unitSuffix(d.unitName)} من «${d.name}» من المخزن مرة أخرى — كانت أُرجعت للمخزن بهذا المستند (المخزون: ${qty(d.currentStock)} ← ${qty(after)})`,
      );
      if (after < -0.0001) warnings.push(`مخزون «${d.name}» سيصبح سالباً (${qty(after)}) — الكمية المرتجعة بيعت مرة أخرى بعد المرتجع`);
    } else {
      // Exchange (new) items that were sold → put them back.
      const restored = -d.delta;
      effects.push(
        `إرجاع ${qty(restored)}${unitSuffix(d.unitName)} من «${d.name}» إلى المخزن — كانت صُرفت كبديل في الاستبدال (المخزون: ${qty(d.currentStock)} ← ${qty(d.currentStock + restored)})`,
      );
    }
  }
  const damaged = db.prepare(
    "SELECT productName, quantity FROM return_items WHERE returnId = ? AND kind = 'returned' AND restock = 0",
  ).all(id) as any[];
  for (const dm of damaged) {
    effects.push(`«${dm.productName}» (${qty(dm.quantity)}) كان مسجلاً تالفاً ولم يدخل المخزن — حذفه لا يعيد مخزوناً`);
  }

  if (ret.settlementType === "account" && ret.customerId && Math.abs(ret.netAmount) > 0.005) {
    if (ret.netAmount > 0) {
      effects.push(`إلغاء مديونية على العميل «${ret.customerName}» بقيمة ${money(ret.netAmount)} (كانت فرق الاستبدال المسجل على حسابه)`);
    } else {
      effects.push(`إلغاء رصيد دائن للعميل «${ret.customerName}» بقيمة ${money(-ret.netAmount)} (كان قيمة المرتجع المسجلة لصالحه)`);
    }
  }
  if (ret.settlementType === "cash" && Math.abs(ret.netAmount) > 0.005) {
    if (ret.netAmount < 0) {
      warnings.push(`تم رد ${money(-ret.netAmount)} نقداً للعميل عند عمل المرتجع — حذف المستند لا يسترد النقدية، فقط يزيل أثرها من التقارير`);
    } else {
      warnings.push(`تم تحصيل ${money(ret.netAmount)} نقداً من العميل (فرق الاستبدال) — الحذف يزيل أثرها من التقارير`);
    }
  }
  if (ret.originalSerial) {
    effects.push(`الكميات المرتجعة ستعود قابلة للإرجاع مرة أخرى على الفاتورة الأصلية ${ret.originalSerial}`);
  }
  effects.push("حذف مستند المرتجع/الاستبدال وبنوده نهائياً، مع تسجيل حركات مخزون عكسية موثقة");

  return { canDelete: blockers.length === 0, mode: "hard", effects, warnings, blockers };
}

function deleteReturn(id: number, actor?: string | null): string | null {
  const p = previewReturn(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  const ret = db.prepare("SELECT serial FROM returns WHERE id = ?").get(id) as any;
  db.exec("BEGIN");
  try {
    reverseDocStock("return", id, `عكس حذف مرتجع ${ret.serial}`, actor);
    db.prepare("DELETE FROM returns WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return null;
}

// ------------------------------------------------------------ quotations ----

function previewQuotation(id: number): DeletePreview | null {
  const q = db.prepare("SELECT * FROM quotations WHERE id = ?").get(id) as any;
  if (!q) return null;

  const effects: string[] = [];
  const blockers: string[] = [];

  const linkedInvoices = db.prepare("SELECT serial FROM sales_invoices WHERE quotationId = ?").all(id) as any[];
  if (linkedInvoices.length) {
    blockers.push(
      `هذه التسعيرة محوّلة إلى فاتورة (${linkedInvoices.map((i) => i.serial).join("، ")}) — احذف الفاتورة أولاً إن أردت حذف التسعيرة`,
    );
  }
  const itemCount = (db.prepare("SELECT COUNT(*) as c FROM quotation_items WHERE quotationId = ?").get(id) as any).c;
  effects.push(`حذف التسعيرة ${q.serial} وبنودها (${itemCount} صنف) نهائياً`);
  effects.push("لا تأثير على المخزون أو الحسابات — التسعيرات لا تحجز مخزوناً ولا تسجل مديونيات");

  return { canDelete: blockers.length === 0, mode: "hard", effects, warnings: [], blockers };
}

function deleteQuotation(id: number): string | null {
  const p = previewQuotation(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  db.prepare("DELETE FROM quotations WHERE id = ?").run(id);
  return null;
}

// -------------------------------------------------------------- products ----

function productRefs(id: number) {
  const c = (sql: string) => (db.prepare(sql).get(id) as any).c as number;
  return {
    sales: c("SELECT COUNT(*) as c FROM sales_invoice_items WHERE productId = ?"),
    purchases: c("SELECT COUNT(*) as c FROM purchase_invoice_items WHERE productId = ?"),
    quotations: c("SELECT COUNT(*) as c FROM quotation_items WHERE productId = ?"),
    returns: c("SELECT COUNT(*) as c FROM return_items WHERE productId = ?"),
    movements: c("SELECT COUNT(*) as c FROM stock_movements WHERE productId = ?"),
    counts: c("SELECT COUNT(*) as c FROM stock_count_items WHERE productId = ?"),
    drafts: draftReferencesProduct(id) ? 1 : 0,
  };
}

function previewProduct(id: number): DeletePreview | null {
  const p = db.prepare(`
    SELECT p.*, u.name as unitName FROM products p
    LEFT JOIN units u ON p.unitId = u.id WHERE p.id = ?
  `).get(id) as any;
  if (!p) return null;

  const refs = productRefs(id);
  const hasHistory = Object.values(refs).some((n) => n > 0);
  const effects: string[] = [];
  const warnings: string[] = [];

  if (hasHistory) {
    const parts: string[] = [];
    if (refs.sales) parts.push(`${refs.sales} بند فاتورة بيع`);
    if (refs.purchases) parts.push(`${refs.purchases} بند مشتريات`);
    if (refs.quotations) parts.push(`${refs.quotations} بند تسعيرة`);
    if (refs.returns) parts.push(`${refs.returns} بند مرتجع`);
    if (refs.movements) parts.push(`${refs.movements} حركة مخزون`);
    effects.push(`المنتج مستخدم في مستندات سابقة (${parts.join("، ")}) — سيتم أرشفته (إخفاؤه) وليس حذفه، حفاظاً على صحة السجلات`);
    effects.push("سيختفي من البحث والكاشير وقوائم المنتجات النشطة، ويمكن إعادة تفعيله لاحقاً من تعديل المنتج");
    if (p.currentStock > 0.0001) {
      warnings.push(
        `المخزون الحالي ${qty(p.currentStock)}${unitSuffix(p.unitName)} بقيمة تكلفة تقريبية ${money(p.currentStock * (p.trueCost || 0))} — سيظل مسجلاً بالنظام لكنه مخفي`,
      );
    }
  } else {
    effects.push(`حذف «${p.nameAr}» نهائياً — المنتج غير مستخدم في أي مستند`);
    if (p.currentStock > 0.0001) {
      warnings.push(`المخزون الحالي ${qty(p.currentStock)}${unitSuffix(p.unitName)} سيُحذف من السجلات نهائياً`);
    }
  }

  return { canDelete: true, mode: hasHistory ? "archive" : "hard", effects, warnings, blockers: [] };
}

function deleteProduct(id: number): string | null {
  const p = previewProduct(id);
  if (!p) return "غير موجود";
  if (p.mode === "archive") {
    db.prepare("UPDATE products SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  } else {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  }
  return null;
}

// ----------------------------------------------- customers / craftsmen / suppliers ----

function customerDebt(id: number): number {
  const r = db.prepare(`
    SELECT COALESCE(c.openingBalance, 0)
      + COALESCE((SELECT SUM(si.remainingAmount) FROM sales_invoices si WHERE si.customerId = c.id AND si.status IN ('finalized','partially_paid','credit','paid')), 0)
      + COALESCE((SELECT SUM(r.netAmount) FROM returns r WHERE r.customerId = c.id AND r.settlementType = 'account'), 0)
      - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customerId = c.id), 0) as debt
    FROM customers c WHERE c.id = ?
  `).get(id) as any;
  return r?.debt || 0;
}

function previewCustomer(id: number): DeletePreview | null {
  const c = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as any;
  if (!c) return null;

  const effects: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const debt = customerDebt(id);
  if (debt > 0.005) blockers.push(`على العميل مديونية ${money(debt)} — حصّل المبلغ أو سوِّ الحساب قبل الحذف`);
  else if (debt < -0.005) blockers.push(`للعميل رصيد دائن ${money(-debt)} (مبلغ لصالحه) — سوِّ الحساب قبل الحذف`);

  const cnt = (sql: string) => (db.prepare(sql).get(id) as any).c as number;
  const invoices = cnt("SELECT COUNT(*) as c FROM sales_invoices WHERE customerId = ?");
  const quotes = cnt("SELECT COUNT(*) as c FROM quotations WHERE customerId = ?");
  const payments = cnt("SELECT COUNT(*) as c FROM customer_payments WHERE customerId = ?");
  const rets = cnt("SELECT COUNT(*) as c FROM returns WHERE customerId = ?");
  // A held draft naming this customer must archive (keep the row) so resuming it doesn't 500.
  const inDraft = draftReferencesCustomer(id);
  const hasHistory = invoices + quotes + payments + rets > 0 || inDraft;

  if (hasHistory) {
    const parts: string[] = [];
    if (invoices) parts.push(`${invoices} فاتورة`);
    if (quotes) parts.push(`${quotes} تسعيرة`);
    if (rets) parts.push(`${rets} مرتجع`);
    if (payments) parts.push(`${payments} دفعة`);
    effects.push(`العميل له معاملات (${parts.join("، ")}) — سيتم أرشفته (إخفاؤه) وليس حذفه، مع الاحتفاظ بكشف الحساب كاملاً`);
    effects.push("سيختفي من قوائم الاختيار في الكاشير والتسعيرات، ويمكن إعادة تفعيله لاحقاً");
  } else {
    effects.push(`حذف العميل «${c.name}» نهائياً — لا توجد أي معاملات مسجلة له`);
  }

  return { canDelete: blockers.length === 0, mode: hasHistory ? "archive" : "hard", effects, warnings, blockers };
}

function deleteCustomer(id: number): string | null {
  const p = previewCustomer(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  if (p.mode === "archive") db.prepare("UPDATE customers SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  else db.prepare("DELETE FROM customers WHERE id = ?").run(id);
  return null;
}

function previewCraftsman(id: number): DeletePreview | null {
  const cr = db.prepare("SELECT * FROM craftsmen WHERE id = ?").get(id) as any;
  if (!cr) return null;

  const effects: string[] = [];
  const blockers: string[] = [];

  const outstanding = (db.prepare(`
    SELECT COALESCE(SUM(craftsmanCommission - commissionPaid), 0) as v
    FROM sales_invoices WHERE craftsmanId = ? AND status NOT IN ('draft','cancelled')
  `).get(id) as any).v || 0;
  if (outstanding > 0.005) {
    blockers.push(`للصنايعي عمولة مستحقة غير مصروفة ${money(outstanding)} — اصرفها أو سوِّها قبل الحذف`);
  }

  const cnt = (sql: string) => (db.prepare(sql).get(id) as any).c as number;
  const invoices = cnt("SELECT COUNT(*) as c FROM sales_invoices WHERE craftsmanId = ?");
  const quotes = cnt("SELECT COUNT(*) as c FROM quotations WHERE craftsmanId = ?");
  const payouts = cnt("SELECT COUNT(*) as c FROM craftsman_payouts WHERE craftsmanId = ?");
  const hasHistory = invoices + quotes + payouts > 0;

  if (hasHistory) {
    const parts: string[] = [];
    if (invoices) parts.push(`${invoices} فاتورة`);
    if (quotes) parts.push(`${quotes} تسعيرة`);
    if (payouts) parts.push(`${payouts} سند صرف عمولة`);
    effects.push(`الصنايعي مرتبط بـ (${parts.join("، ")}) — سيتم أرشفته (إخفاؤه) وليس حذفه، مع الاحتفاظ بسجل العمولات كاملاً`);
    effects.push("سيختفي من قوائم الاختيار، ويمكن إعادة تفعيله لاحقاً");
  } else {
    effects.push(`حذف الصنايعي «${cr.name}» نهائياً — لا توجد أي معاملات مسجلة له`);
  }

  return { canDelete: blockers.length === 0, mode: hasHistory ? "archive" : "hard", effects, warnings: [], blockers };
}

function deleteCraftsman(id: number): string | null {
  const p = previewCraftsman(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  if (p.mode === "archive") db.prepare("UPDATE craftsmen SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  else db.prepare("DELETE FROM craftsmen WHERE id = ?").run(id);
  return null;
}

function previewSupplier(id: number): DeletePreview | null {
  const s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as any;
  if (!s) return null;

  const effects: string[] = [];
  const blockers: string[] = [];

  const debt = (db.prepare(`
    SELECT COALESCE(s.openingBalance, 0)
      + COALESCE((SELECT SUM(pi.remainingAmount) FROM purchase_invoices pi WHERE pi.supplierId = s.id AND pi.status IN ('finalized','partially_paid','credit','paid')), 0)
      - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplierId = s.id), 0) as debt
    FROM suppliers s WHERE s.id = ?
  `).get(id) as any).debt || 0;
  if (debt > 0.005) blockers.push(`للمورد مستحقات عليك بقيمة ${money(debt)} — سدّدها أو سوِّ الحساب قبل الحذف`);
  else if (debt < -0.005) blockers.push(`لك رصيد عند المورد بقيمة ${money(-debt)} — سوِّ الحساب قبل الحذف`);

  const cnt = (sql: string) => (db.prepare(sql).get(id) as any).c as number;
  const purchases = cnt("SELECT COUNT(*) as c FROM purchase_invoices WHERE supplierId = ?");
  const payments = cnt("SELECT COUNT(*) as c FROM supplier_payments WHERE supplierId = ?");
  const products = cnt("SELECT COUNT(*) as c FROM products WHERE supplierId = ?");
  const hasHistory = purchases + payments + products > 0;

  if (hasHistory) {
    const parts: string[] = [];
    if (purchases) parts.push(`${purchases} فاتورة مشتريات`);
    if (payments) parts.push(`${payments} دفعة`);
    if (products) parts.push(`${products} منتج مسجل باسمه`);
    effects.push(`المورد مرتبط بـ (${parts.join("، ")}) — سيتم أرشفته (إخفاؤه) وليس حذفه، مع الاحتفاظ بالسجلات`);
    effects.push("سيختفي من قوائم الاختيار، ويمكن إعادة تفعيله لاحقاً");
  } else {
    effects.push(`حذف المورد «${s.name}» نهائياً — لا توجد أي معاملات مسجلة له`);
  }

  return { canDelete: blockers.length === 0, mode: hasHistory ? "archive" : "hard", effects, warnings: [], blockers };
}

function deleteSupplier(id: number): string | null {
  const p = previewSupplier(id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  if (p.mode === "archive") db.prepare("UPDATE suppliers SET isActive = 0, updatedAt = datetime('now') WHERE id = ?").run(id);
  else db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
  return null;
}

// -------------------------------------- categories / brands / units ----------

function previewAttribute(table: "categories" | "brands" | "units", column: string, label: string, id: number): DeletePreview | null {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as any;
  if (!row) return null;

  const used = (db.prepare(`SELECT COUNT(*) as c FROM products WHERE ${column} = ?`).get(id) as any).c as number;
  const effects: string[] = [];
  const blockers: string[] = [];

  if (used > 0) {
    blockers.push(`${label} «${row.name}» مستخدم في ${used} منتج — عدّل هذه المنتجات أو انقلها ${label === "الوحدة" ? "لوحدة أخرى" : "لتصنيف/ماركة أخرى"} أولاً`);
  } else {
    effects.push(`حذف ${label} «${row.name}» نهائياً — غير مستخدم في أي منتج`);
  }

  return { canDelete: blockers.length === 0, mode: "hard", effects, warnings: [], blockers };
}

function deleteAttribute(table: "categories" | "brands" | "units", column: string, label: string, id: number): string | null {
  const p = previewAttribute(table, column, label, id);
  if (!p) return "غير موجود";
  if (!p.canDelete) return p.blockers[0];
  db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return null;
}

// ----------------------------------------------------------------- api ------

export const DELETABLE_ENTITIES = [
  "sales", "purchases", "returns", "quotations",
  "products", "customers", "craftsmen", "suppliers",
  "categories", "brands", "units",
] as const;
export type DeletableEntity = (typeof DELETABLE_ENTITIES)[number];

export function previewDelete(entity: string, id: number): DeletePreview | null | undefined {
  switch (entity) {
    case "sales": return previewSales(id);
    case "purchases": return previewPurchase(id);
    case "returns": return previewReturn(id);
    case "quotations": return previewQuotation(id);
    case "products": return previewProduct(id);
    case "customers": return previewCustomer(id);
    case "craftsmen": return previewCraftsman(id);
    case "suppliers": return previewSupplier(id);
    case "categories": return previewAttribute("categories", "categoryId", "التصنيف", id);
    case "brands": return previewAttribute("brands", "brandId", "الماركة", id);
    case "units": return previewAttribute("units", "unitId", "الوحدة", id);
    default: return undefined; // unknown entity
  }
}

/** Executes the delete. Returns null on success or an Arabic error message. */
export function performDelete(entity: string, id: number, actor?: string | null): string | null | undefined {
  switch (entity) {
    case "sales": return deleteSales(id, actor);
    case "purchases": return deletePurchase(id, actor);
    case "returns": return deleteReturn(id, actor);
    case "quotations": return deleteQuotation(id);
    case "products": return deleteProduct(id);
    case "customers": return deleteCustomer(id);
    case "craftsmen": return deleteCraftsman(id);
    case "suppliers": return deleteSupplier(id);
    case "categories": return deleteAttribute("categories", "categoryId", "التصنيف", id);
    case "brands": return deleteAttribute("brands", "brandId", "الماركة", id);
    case "units": return deleteAttribute("units", "unitId", "الوحدة", id);
    default: return undefined;
  }
}
