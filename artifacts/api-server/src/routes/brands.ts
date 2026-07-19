import { Router } from "express";
import db from "../lib/db.js";
import { performDelete } from "../lib/deletion.js";

const router = Router();

router.get("/brands", (_req, res) => {
  res.json(db.prepare("SELECT * FROM brands ORDER BY name").all());
});

router.post("/brands", (req, res) => {
  const { name, nameEn } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare("INSERT INTO brands (name, nameEn) VALUES (?, ?)").run(name, nameEn || null);
  res.status(201).json(db.prepare("SELECT * FROM brands WHERE id = ?").get(r.lastInsertRowid));
});

router.patch("/brands/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, nameEn } = req.body;
  db.prepare("UPDATE brands SET name = COALESCE(?, name), nameEn = COALESCE(?, nameEn) WHERE id = ?").run(name || null, nameEn !== undefined ? nameEn : null, id);
  res.json(db.prepare("SELECT * FROM brands WHERE id = ?").get(id));
});

// Refuses (with a friendly message) when the brand is still used by products.
router.delete("/brands/:id", (req, res) => {
  const err = performDelete("brands", Number(req.params.id));
  if (err === "غير موجود") return res.status(404).json({ error: err });
  if (err) return res.status(400).json({ error: err });
  res.json({ success: true });
});

export default router;
