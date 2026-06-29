import { Router } from "express";
import db from "../lib/db.js";
import { nextReturnSerial } from "../lib/db.js";
import { archiveReturn } from "../lib/archive.js";

const router = Router();

// Quantity of a product already returned against a given invoice (across all
// prior return documents). Used to cap how much can still be returned.
function alreadyReturned(invoiceId: number, productId: number): number {
  const r = db.prepare(`
    SELECT COALESCE(SUM(ri.quantity), 0) as v
    FROM return_items ri JOIN returns r ON ri.returnId = r.id
    WHERE r.originalInvoiceId = ? AND ri.kind = 'returned' AND ri.productId = ?
  `).get(invoiceId, productId) as any;
  return r?.v || 0;
}

function returnReceipt(id: number) {
  const ret = db.prepare(`
    SELECT r.*, c.name as customerName, c.phone as customerPhone
    FROM returns r LEFT JOIN customers c ON r.customerId = c.id
    WHERE r.id = ?
  `).get(id) as any;
  if (!ret) return null;
  const items = db.prepare(`
    SELECT ri.*, p.sku, u.name as unitName
    FROM return_items ri
    LEFT JOIN products p ON ri.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE ri.returnId = ? ORDER BY ri.kind DESC, ri.id
  `).all(id);
  return { ...ret, items };
}

// Look up an invoice by serial for the returns screen: each line is annotated
// with how much was already returned and how much is still returnable.
router.get("/returns/lookup/:serial", (req, res) => {
  const inv = db.prepare(`
    SELECT si.*, c.name as customerName, c.phone as customerPhone
    FROM sales_invoices si LEFT JOIN customers c ON si.customerId = c.id
    WHERE si.serial = ?
  `).get(req.params.serial) as any;
  if (!inv) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  if (inv.status === "draft" || inv.status === "cancelled") {
    return res.status(400).json({ error: "الفاتورة غير مكتملة، لا يمكن عمل مرتجع لها" });
  }

  const rawItems = db.prepare(`
    SELECT sii.productId, sii.quantity, sii.unitPrice, sii.total,
           p.nameAr as productName, p.sku, p.barcode, p.currentStock, u.name as unitName
    FROM sales_invoice_items sii
    LEFT JOIN products p ON sii.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE sii.invoiceId = ? ORDER BY sii.id
  `).all(inv.id) as any[];

  const items = rawItems.map((it) => {
    const returnedQty = alreadyReturned(inv.id, it.productId);
    return { ...it, returnedQty, availableQty: Math.max(0, it.quantity - returnedQty) };
  });

  res.json({ ...inv, items });
});

router.get("/returns", (req, res) => {
  const { search, limit = 50, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];
  if (search) {
    conditions.push("(r.serial LIKE ? OR r.originalSerial LIKE ? OR c.name LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`
    SELECT r.*, c.name as customerName
    FROM returns r LEFT JOIN customers c ON r.customerId = c.id
    ${where} ORDER BY r.createdAt DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM returns r LEFT JOIN customers c ON r.customerId = c.id ${where}`).get(...params) as any).c;
  res.json({ items, total });
});

router.get("/returns/:id", (req, res) => {
  const receipt = returnReceipt(Number(req.params.id));
  if (!receipt) return res.status(404).json({ error: "غير موجود" });
  res.json(receipt);
});

// Create a return / exchange against an existing invoice.
router.post("/returns", (req, res) => {
  const {
    originalInvoiceId,
    settlementType = "cash",
    notes,
    returnedItems = [],
    newItems = [],
  } = req.body || {};

  const inv = db.prepare("SELECT * FROM sales_invoices WHERE id = ?").get(Number(originalInvoiceId)) as any;
  if (!inv) return res.status(404).json({ error: "الفاتورة غير موجودة" });
  if (inv.status === "draft" || inv.status === "cancelled") {
    return res.status(400).json({ error: "الفاتورة غير مكتملة" });
  }
  if (!returnedItems.length && !newItems.length) {
    return res.status(400).json({ error: "اختر صنفًا للمرتجع أو الاستبدال" });
  }

  // Validate returned quantities against what's still returnable on this invoice.
  for (const it of returnedItems) {
    const line = db.prepare(
      "SELECT SUM(quantity) as q FROM sales_invoice_items WHERE invoiceId = ? AND productId = ?",
    ).get(inv.id, Number(it.productId)) as any;
    const bought = line?.q || 0;
    const available = bought - alreadyReturned(inv.id, Number(it.productId));
    if (Number(it.quantity) > available + 0.0001) {
      return res.status(400).json({ error: `الكمية المرتجعة أكبر من المتاح للصنف رقم ${it.productId}` });
    }
  }

  if (settlementType === "account" && !inv.customerId) {
    return res.status(400).json({ error: "التسوية على الحساب تحتاج فاتورة باسم عميل مسجّل" });
  }

  const returnedTotal = returnedItems.reduce((s: number, it: any) => s + Number(it.quantity) * Number(it.unitPrice), 0);
  const newItemsTotal = newItems.reduce((s: number, it: any) => s + Number(it.quantity) * Number(it.unitPrice), 0);
  const netAmount = Math.round((newItemsTotal - returnedTotal) * 100) / 100;
  const type = newItems.length ? "exchange" : "return";

  db.exec("BEGIN");
  try {
    const r = db.prepare(`
      INSERT INTO returns (serial, originalInvoiceId, originalSerial, customerId, type, settlementType, returnedTotal, newItemsTotal, netAmount, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(nextReturnSerial(), inv.id, inv.serial, inv.customerId || null, type, settlementType,
      Math.round(returnedTotal * 100) / 100, Math.round(newItemsTotal * 100) / 100, netAmount, notes || null);
    const returnId = r.lastInsertRowid as number;

    const addItem = db.prepare(
      "INSERT INTO return_items (returnId, kind, productId, productName, quantity, unitPrice, total, restock) VALUES (?,?,?,?,?,?,?,?)",
    );
    const moveStock = db.prepare("UPDATE products SET currentStock = currentStock + ?, updatedAt = datetime('now') WHERE id = ?");
    const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes) VALUES (?,?,?,?,?,?,?,?)");

    // Returned items: money credited back; restock=1 puts them back in stock.
    for (const it of returnedItems) {
      const pid = Number(it.productId);
      const qty = Number(it.quantity);
      const price = Number(it.unitPrice);
      const restock = it.restock === false ? 0 : 1;
      const prod = db.prepare("SELECT nameAr, currentStock FROM products WHERE id = ?").get(pid) as any;
      addItem.run(returnId, "returned", pid, prod?.nameAr || null, qty, price, Math.round(qty * price * 100) / 100, restock);
      if (restock) {
        const before = prod?.currentStock || 0;
        moveStock.run(qty, pid);
        insertMove.run(pid, "return", qty, before, before + qty, "return", returnId, `مرتجع ${inv.serial}`);
      }
    }

    // New items (exchange): sold out of stock like a normal sale.
    for (const it of newItems) {
      const pid = Number(it.productId);
      const qty = Number(it.quantity);
      const price = Number(it.unitPrice);
      const prod = db.prepare("SELECT nameAr, currentStock FROM products WHERE id = ?").get(pid) as any;
      addItem.run(returnId, "new", pid, prod?.nameAr || null, qty, price, Math.round(qty * price * 100) / 100, 1);
      const before = prod?.currentStock || 0;
      db.prepare("UPDATE products SET currentStock = currentStock - ?, updatedAt = datetime('now') WHERE id = ?").run(qty, pid);
      insertMove.run(pid, "sale", qty, before, before - qty, "return", returnId, `استبدال ${inv.serial}`);
    }

    db.exec("COMMIT");
    res.status(201).json(returnReceipt(returnId));
    // Auto-archive a PDF of the return/exchange (best-effort).
    archiveReturn(returnId).catch((e) => console.error("archive return failed:", e?.message || e));
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
});

export default router;
