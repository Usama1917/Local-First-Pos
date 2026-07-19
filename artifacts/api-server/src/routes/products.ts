import { Router } from "express";
import db, { nextBarcode } from "../lib/db.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

// Translate a SQLite UNIQUE violation into a friendly Arabic message (or null).
function uniqueErrorMessage(e: any): string | null {
  if (e?.code === "ERR_SQLITE_ERROR" && /UNIQUE constraint failed/.test(e?.message || "")) {
    return /barcode/.test(e.message) ? "الباركود مستخدم بالفعل" : "الكود (SKU) مستخدم بالفعل";
  }
  return null;
}

const PRODUCT_SELECT = `
  SELECT p.*, 
    c.name as categoryName, b.name as brandName, s.name as supplierName, u.name as unitName,
    CASE WHEN p.currentStock <= p.minStock THEN 1 ELSE 0 END as isLowStock
  FROM products p
  LEFT JOIN categories c ON p.categoryId = c.id
  LEFT JOIN brands b ON p.brandId = b.id
  LEFT JOIN suppliers s ON p.supplierId = s.id
  LEFT JOIN units u ON p.unitId = u.id
`;

router.get("/products", (req, res) => {
  const { search, categoryId, brandId, supplierId, lowStock, isActive, limit = 100, offset = 0 } = req.query as any;
  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push("(p.nameAr LIKE ? OR p.nameEn LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }
  if (categoryId) { conditions.push("p.categoryId = ?"); params.push(Number(categoryId)); }
  if (brandId) { conditions.push("p.brandId = ?"); params.push(Number(brandId)); }
  if (supplierId) { conditions.push("p.supplierId = ?"); params.push(Number(supplierId)); }
  if (lowStock === "true") { conditions.push("p.currentStock <= p.minStock"); }
  // Archived products hidden by default (matches the delete "إخفاء" promise);
  // pass isActive explicitly to override.
  if (isActive !== undefined) { conditions.push("p.isActive = ?"); params.push(isActive === "true" ? 1 : 0); }
  else { conditions.push("p.isActive = 1"); }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const items = db.prepare(`${PRODUCT_SELECT} ${where} ORDER BY p.nameAr LIMIT ? OFFSET ?`).all(...params, Number(limit), Number(offset));
  const total = (db.prepare(`SELECT COUNT(*) as c FROM products p ${where}`).get(...params) as any).c;
  res.json({ items, total, limit: Number(limit), offset: Number(offset) });
});

router.get("/products/search", (req, res) => {
  const { q } = req.query as any;
  if (!q) return res.json([]);
  const pattern = `%${q}%`;
  const rows = db.prepare(`
    ${PRODUCT_SELECT}
    WHERE p.isActive = 1 AND (p.nameAr LIKE ? OR p.nameEn LIKE ? OR p.sku LIKE ? OR p.barcode = ?)
    ORDER BY p.nameAr LIMIT 20
  `).all(pattern, pattern, pattern, q);
  res.json(rows);
});

// Generate a fresh store-internal barcode (unique, not yet in the DB). Defined
// before "/products/:id" so it isn't swallowed by the :id route.
router.get("/products/next-barcode", (_req, res) => {
  res.json({ barcode: nextBarcode() });
});

router.post("/products", (req, res) => {
  const {
    nameAr, nameEn, sku, barcode, categoryId, brandId, supplierId, unitId,
    listPrice = 0, supplierDiscount = 0, netPurchasePrice = 0, extraCost = 0,
    trueCost = 0, sellingPrice = 0, minSellingPrice, currentStock = 0, minStock = 5,
    location, notes, colorCode, paintType, packageSize, soldByWeight = false, isActive = true,
  } = req.body;

  if (!nameAr || !sku) return res.status(400).json({ error: "الاسم والكود مطلوبان" });

  let r;
  try {
    r = db.prepare(`
      INSERT INTO products
      (nameAr, nameEn, sku, barcode, categoryId, brandId, supplierId, unitId, listPrice, supplierDiscount,
       netPurchasePrice, extraCost, trueCost, sellingPrice, minSellingPrice, currentStock, minStock,
       location, notes, colorCode, paintType, packageSize, soldByWeight, isActive)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      nameAr, nameEn || null, sku, barcode || null,
      categoryId || null, brandId || null, supplierId || null, unitId || null,
      listPrice, supplierDiscount, netPurchasePrice, extraCost, trueCost,
      sellingPrice, minSellingPrice || null, currentStock, minStock,
      location || null, notes || null, colorCode || null, paintType || null, packageSize || null,
      soldByWeight ? 1 : 0, isActive ? 1 : 0,
    );
  } catch (e: any) {
    const msg = uniqueErrorMessage(e);
    if (msg) return res.status(400).json({ error: msg });
    throw e;
  }

  if (currentStock > 0) {
    db.prepare(`INSERT INTO stock_movements (productId, type, quantity, balanceBefore, balanceAfter, referenceType, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(r.lastInsertRowid, "opening", currentStock, 0, currentStock, "manual", "رصيد افتتاحي");
  }

  res.status(201).json(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(r.lastInsertRowid));
});

router.get("/products/:id", (req, res) => {
  const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.patch("/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
  if (!existing) return res.status(404).json({ error: "غير موجود" });

  const {
    nameAr, nameEn, sku, barcode, categoryId, brandId, supplierId, unitId,
    listPrice, supplierDiscount, netPurchasePrice, extraCost, trueCost,
    sellingPrice, minSellingPrice, minStock, location, notes,
    colorCode, paintType, packageSize, soldByWeight, isActive,
  } = req.body;

  // For nullable TEXT fields, COALESCE(?, col) + `value || null` can NEVER clear a
  // field (empty string → null → keeps old). Distinguish "omitted" from "cleared":
  // present key with empty value → write NULL; absent key → keep existing.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(req.body, k);
  const clearable = (k: string, v: any) => (has(k) ? (v || null) : existing[k]);
  const effWeight = soldByWeight !== undefined ? (soldByWeight ? 1 : 0) : existing.soldByWeight;
  // Weight products never keep a barcode (domain rule: soldByWeight ⇒ no barcode).
  const barcodeVal = effWeight ? null : clearable("barcode", barcode);

  try {
    db.prepare(`
      UPDATE products SET
      nameAr = COALESCE(?, nameAr), nameEn = ?, sku = COALESCE(?, sku),
      barcode = ?, categoryId = COALESCE(?, categoryId), brandId = COALESCE(?, brandId),
      supplierId = COALESCE(?, supplierId), unitId = COALESCE(?, unitId),
      listPrice = COALESCE(?, listPrice), supplierDiscount = COALESCE(?, supplierDiscount),
      netPurchasePrice = COALESCE(?, netPurchasePrice), extraCost = COALESCE(?, extraCost),
      trueCost = COALESCE(?, trueCost), sellingPrice = COALESCE(?, sellingPrice),
      minSellingPrice = COALESCE(?, minSellingPrice), minStock = COALESCE(?, minStock),
      location = ?, notes = ?,
      colorCode = ?, paintType = ?, packageSize = ?,
      soldByWeight = COALESCE(?, soldByWeight), isActive = COALESCE(?, isActive), updatedAt = datetime('now')
      WHERE id = ?
    `).run(
      nameAr || null, clearable("nameEn", nameEn), sku || null, barcodeVal,
      categoryId || null, brandId || null, supplierId || null, unitId || null,
      listPrice ?? null, supplierDiscount ?? null, netPurchasePrice ?? null,
      extraCost ?? null, trueCost ?? null, sellingPrice ?? null, minSellingPrice ?? null,
      minStock ?? null, clearable("location", location), clearable("notes", notes), clearable("colorCode", colorCode),
      clearable("paintType", paintType), clearable("packageSize", packageSize),
      soldByWeight !== undefined ? (soldByWeight ? 1 : 0) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      id,
    );
  } catch (e: any) {
    const msg = uniqueErrorMessage(e);
    if (msg) return res.status(400).json({ error: msg });
    throw e;
  }

  res.json(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id));
});

// Hard-deletes when the product was never used in any document; archives
// (isActive=0) when history exists so past invoices stay intact.
router.delete("/products/:id", (req, res) => {
  const err = performDelete("products", Number(req.params.id));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

router.get("/products/:id/movements", (req, res) => {
  const { limit = 50, offset = 0 } = req.query as any;
  const items = db.prepare(`
    SELECT sm.*, p.nameAr as productName, p.sku 
    FROM stock_movements sm 
    LEFT JOIN products p ON sm.productId = p.id
    WHERE sm.productId = ? 
    ORDER BY sm.createdAt DESC LIMIT ? OFFSET ?
  `).all(Number(req.params.id), Number(limit), Number(offset));
  const total = (db.prepare("SELECT COUNT(*) as c FROM stock_movements WHERE productId = ?").get(Number(req.params.id)) as any).c;
  res.json({ items, total });
});

export default router;
