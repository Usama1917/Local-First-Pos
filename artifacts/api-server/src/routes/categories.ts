import { Router } from "express";
import db from "../lib/db.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

router.get("/categories", (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(p.id) as productCount 
    FROM categories c 
    LEFT JOIN products p ON p.categoryId = c.id 
    GROUP BY c.id ORDER BY c.name
  `).all();
  res.json(rows);
});

router.post("/categories", (req, res) => {
  const { name, nameEn } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare("INSERT INTO categories (name, nameEn) VALUES (?, ?)").run(name, nameEn || null);
  const row = db.prepare("SELECT *, 0 as productCount FROM categories WHERE id = ?").get(r.lastInsertRowid);
  res.status(201).json(row);
});

router.get("/categories/:id", (req, res) => {
  const row = db.prepare("SELECT *, 0 as productCount FROM categories WHERE id = ?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json(row);
});

router.patch("/categories/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, nameEn } = req.body;
  db.prepare("UPDATE categories SET name = COALESCE(?, name), nameEn = COALESCE(?, nameEn) WHERE id = ?").run(name || null, nameEn !== undefined ? nameEn : null, id);
  const row = db.prepare("SELECT *, 0 as productCount FROM categories WHERE id = ?").get(id);
  res.json(row);
});

// Refuses (with a friendly message) when the category is still used by products.
router.delete("/categories/:id", (req, res) => {
  const err = performDelete("categories", Number(req.params.id));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

export default router;
