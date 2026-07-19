import { Router } from "express";
import db from "../lib/db.js";
import { actorName } from "../lib/actor.js";

const router = Router();

router.get("/stock/movements", (req, res) => {
  const { productId, type, dateFrom, dateTo, limit = 100, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (productId) { conditions.push("sm.productId = ?"); params.push(Number(productId)); }
  if (type) { conditions.push("sm.type = ?"); params.push(type); }
  if (dateFrom) { conditions.push("date(sm.createdAt) >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("date(sm.createdAt) <= ?"); params.push(dateTo); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`
    SELECT sm.*, p.nameAr as productName, p.sku
    FROM stock_movements sm LEFT JOIN products p ON sm.productId = p.id
    ${where} ORDER BY sm.createdAt DESC LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM stock_movements sm ${where}`).get(...params) as any).c;
  res.json({ items, total });
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
  const { name, notes } = req.body;
  const products = db.prepare("SELECT id, currentStock FROM products WHERE isActive = 1").all() as any[];
  let countId = 0;
  db.exec("BEGIN");
  try {
    const r = db.prepare("INSERT INTO stock_counts (name, notes, status, createdBy) VALUES (?,?,'draft',?)").run(name || `جرد ${new Date().toLocaleDateString("ar-EG")}`, notes || null, actorName(req));
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
