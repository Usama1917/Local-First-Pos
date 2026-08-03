import { Router } from "express";
import db from "../lib/db.js";
import { actorName } from "../lib/actor.js";

const router = Router();

// A movement is "not yet counted" while no stock count has reconciled it. Archived
// products are excluded — they can't be counted, so their movements would sit in
// the list forever.
const UNCOUNTED_WHERE = "sm.stockCountId IS NULL AND p.isActive = 1";

router.get("/stock/movements", (req, res) => {
  const { productId, type, dateFrom, dateTo, uncounted, limit = 100, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (productId) { conditions.push("sm.productId = ?"); params.push(Number(productId)); }
  if (type) { conditions.push("sm.type = ?"); params.push(type); }
  if (dateFrom) { conditions.push("date(sm.createdAt) >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("date(sm.createdAt) <= ?"); params.push(dateTo); }
  if (uncounted === "true" || uncounted === true) conditions.push(UNCOUNTED_WHERE);

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  // The join is in the count query too — `uncounted` filters on p.isActive.
  const items = db.prepare(`
    SELECT sm.*, p.nameAr as productName, p.sku, u.name as unitName
    FROM stock_movements sm
    LEFT JOIN products p ON sm.productId = p.id
    LEFT JOIN units u ON p.unitId = u.id
    ${where} ORDER BY sm.createdAt DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`
    SELECT COUNT(*) as c FROM stock_movements sm LEFT JOIN products p ON sm.productId = p.id ${where}
  `).get(...params) as any).c;
  res.json({ items, total });
});

/** Products with movements no stock count has reconciled yet — what a quick count covers. */
function uncountedProductIds(): number[] {
  return (db.prepare(`
    SELECT DISTINCT sm.productId as id
    FROM stock_movements sm JOIN products p ON sm.productId = p.id
    WHERE ${UNCOUNTED_WHERE}
  `).all() as any[]).map((r) => r.id);
}

// Headline numbers for the quick-count button and the dashboard card.
router.get("/stock/uncounted-summary", (_req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) as movements, COUNT(DISTINCT sm.productId) as products
    FROM stock_movements sm JOIN products p ON sm.productId = p.id
    WHERE ${UNCOUNTED_WHERE}
  `).get() as any;
  res.json({ movements: row?.movements || 0, products: row?.products || 0 });
});

router.post("/stock/adjustment", (req, res) => {
  const { productId, quantity, notes, type = "adjustment" } = req.body;
  if (!productId || quantity === undefined) return res.status(400).json({ error: "المنتج والكمية مطلوبان" });

  const prod = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(productId)) as any;
  if (!prod) return res.status(404).json({ error: "المنتج غير موجود" });

  const before = prod.currentStock;
  const after = before + Number(quantity);

  db.prepare("UPDATE products SET currentStock = ?, updatedAt = datetime('now') WHERE id = ?").run(after, productId);
  const r = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, notes, createdBy) VALUES (?,?,?,?,?,?,?,?)").run(
    productId, type, quantity, before, after, "manual", notes || null, actorName(req),
  );
  res.status(201).json(db.prepare("SELECT * FROM stock_movements WHERE id = ?").get(r.lastInsertRowid));
});

function listStockCounts(req: any, res: any) {
  const items = db.prepare("SELECT sc.*, COUNT(sci.id) as itemCount FROM stock_counts sc LEFT JOIN stock_count_items sci ON sc.id = sci.stockCountId GROUP BY sc.id ORDER BY sc.createdAt DESC").all();
  res.json({ items, total: items.length });
}

function createStockCount(req: any, res: any) {
  const { name, notes, scope } = req.body;

  // scope=uncounted → "جلسة جرد سريعة": only the products that actually moved and
  // haven't been verified since, instead of walking the whole warehouse.
  const quick = scope === "uncounted";
  let products: any[];
  if (quick) {
    const ids = uncountedProductIds();
    if (!ids.length) return res.status(400).json({ error: "لا توجد حركات مخزن تحتاج جرد — كل الحركات متجردة" });
    products = db.prepare(
      `SELECT id, currentStock FROM products WHERE id IN (${ids.map(() => "?").join(",")})`,
    ).all(...ids) as any[];
  } else {
    products = db.prepare("SELECT id, currentStock FROM products WHERE isActive = 1").all() as any[];
  }

  const today = new Date().toLocaleDateString("ar-EG");
  const defaultName = quick ? `جرد سريع ${today}` : `جرد ${today}`;

  let countId = 0;
  db.exec("BEGIN");
  try {
    const r = db.prepare("INSERT INTO stock_counts (name, notes, status, createdBy) VALUES (?,?,'draft',?)").run(name || defaultName, notes || null, actorName(req));
    countId = r.lastInsertRowid as number;
    const insertItem = db.prepare("INSERT INTO stock_count_items (stockCountId, productId, systemQty, countedQty) VALUES (?,?,?,?)");
    for (const p of products) insertItem.run(countId, p.id, p.currentStock, p.currentStock);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  res.status(201).json(db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(countId));
}

function getStockCount(req: any, res: any) {
  const id = Number(req.params.id);
  const count = db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(id);
  if (!count) return res.status(404).json({ error: "غير موجود" });
  const items = db.prepare(`
    SELECT sci.*, p.nameAr as productName, p.sku, p.barcode, c.name as categoryName, u.name as unitName
    FROM stock_count_items sci
    LEFT JOIN products p ON sci.productId = p.id
    LEFT JOIN categories c ON p.categoryId = c.id
    LEFT JOIN units u ON p.unitId = u.id
    WHERE sci.stockCountId = ? ORDER BY p.nameAr
  `).all(id);
  res.json({ ...count as any, items });
}

function patchStockCount(req: any, res: any) {
  const id = Number(req.params.id);
  const { name, notes, items } = req.body;

  if (items) {
    const updateItem = db.prepare("UPDATE stock_count_items SET countedQty = ?, notes = ? WHERE stockCountId = ? AND productId = ?");
    for (const item of items) {
      updateItem.run(item.countedQty, item.notes || null, id, item.productId);
    }
  }
  if (name !== undefined || notes !== undefined) {
    db.prepare("UPDATE stock_counts SET name = COALESCE(?, name), notes = COALESCE(?, notes) WHERE id = ?").run(name || null, notes || null, id);
  }
  res.json(db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(id));
}

function finalizeStockCount(req: any, res: any) {
  const id = Number(req.params.id);
  const count = db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(id) as any;
  if (!count) return res.status(404).json({ error: "غير موجود" });
  if (count.status !== "draft") return res.status(400).json({ error: "الجرد مُنجز بالفعل" });

  const items = db.prepare("SELECT * FROM stock_count_items WHERE stockCountId = ?").all(id) as any[];

  db.exec("BEGIN");
  try {
    const insertMove = db.prepare("INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, referenceId, notes) VALUES (?,?,?,?,?,?,?,?)");
    for (const item of items) {
      const diff = item.countedQty - item.systemQty;
      if (diff !== 0) {
        db.prepare("UPDATE products SET currentStock = ?, updatedAt = datetime('now') WHERE id = ?").run(item.countedQty, item.productId);
        insertMove.run(item.productId, diff > 0 ? "count_positive" : "count_negative", Math.abs(diff), item.systemQty, item.countedQty, "stock_count", id, `جرد #${id}`);
      }
    }
    db.prepare("UPDATE stock_counts SET status = 'finalized', finalizedAt = datetime('now') WHERE id = ?").run(id);

    // Everything this count covered is now verified against physical stock —
    // including the correction movements just written, which belong to it. Runs
    // last so those corrections are stamped too, and they drop off the
    // "not yet counted" list together with what caused them.
    db.prepare(`
      UPDATE stock_movements SET stockCountId = ?
      WHERE stockCountId IS NULL
        AND productId IN (SELECT productId FROM stock_count_items WHERE stockCountId = ?)
    `).run(id, id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.json(db.prepare("SELECT * FROM stock_counts WHERE id = ?").get(id));
}

router.get("/stock/counts", listStockCounts);
router.post("/stock/counts", createStockCount);
router.get("/stock/counts/:id", getStockCount);
router.patch("/stock/counts/:id", patchStockCount);
router.post("/stock/counts/:id/finalize", finalizeStockCount);

router.get("/stock-counts", listStockCounts);
router.post("/stock-counts", createStockCount);
router.get("/stock-counts/:id", getStockCount);
router.patch("/stock-counts/:id", patchStockCount);
router.post("/stock-counts/:id/finalize", finalizeStockCount);

export default router;
