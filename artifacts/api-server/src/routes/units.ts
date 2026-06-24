import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/units", (_req, res) => {
  res.json(db.prepare("SELECT * FROM units ORDER BY name").all());
});

router.post("/units", (req, res) => {
  const { name, nameEn } = req.body;
  if (!name) return res.status(400).json({ error: "الاسم مطلوب" });
  const r = db.prepare("INSERT INTO units (name, nameEn) VALUES (?, ?)").run(name, nameEn || null);
  res.status(201).json(db.prepare("SELECT * FROM units WHERE id = ?").get(r.lastInsertRowid));
});

router.patch("/units/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, nameEn } = req.body;
  db.prepare("UPDATE units SET name = COALESCE(?, name), nameEn = COALESCE(?, nameEn) WHERE id = ?").run(name || null, nameEn !== undefined ? nameEn : null, id);
  res.json(db.prepare("SELECT * FROM units WHERE id = ?").get(id));
});

router.delete("/units/:id", (req, res) => {
  db.prepare("DELETE FROM units WHERE id = ?").run(Number(req.params.id));
  res.json({ success: true });
});

export default router;
