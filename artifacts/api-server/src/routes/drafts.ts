import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/drafts", (req, res) => {
  const { type } = req.query as any;
  const where = type ? "WHERE type = ?" : "";
  const params = type ? [type] : [];
  res.json(db.prepare(`SELECT * FROM drafts ${where} ORDER BY savedAt DESC`).all(...params));
});

router.post("/drafts", (req, res) => {
  const { type, entityId, data } = req.body;
  if (!type || !entityId || !data) return res.status(400).json({ error: "البيانات مطلوبة" });
  db.prepare("INSERT INTO drafts (type, entityId, data, savedAt) VALUES (?,?,?,datetime('now')) ON CONFLICT(type, entityId) DO UPDATE SET data = excluded.data, savedAt = excluded.savedAt").run(type, entityId, typeof data === "string" ? data : JSON.stringify(data));
  const row = db.prepare("SELECT * FROM drafts WHERE type = ? AND entityId = ?").get(type, entityId);
  res.json(row);
});

router.get("/drafts/:type/:entityId", (req, res) => {
  const row = db.prepare("SELECT * FROM drafts WHERE type = ? AND entityId = ?").get(req.params.type, req.params.entityId);
  if (!row) return res.status(404).json({ error: "لا توجد مسودة" });
  res.json(row);
});

router.delete("/drafts/:type/:entityId", (req, res) => {
  db.prepare("DELETE FROM drafts WHERE type = ? AND entityId = ?").run(req.params.type, req.params.entityId);
  res.json({ success: true });
});

export default router;
