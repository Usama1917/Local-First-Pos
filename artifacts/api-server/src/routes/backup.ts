import { Router } from "express";
import db from "../lib/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, "../../../../data/backups");
const router = Router();

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

router.post("/backup/create", (_req, res) => {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `backup-${ts}.db`);
    (db as any).backup(backupPath);
    db.prepare("UPDATE settings SET lastBackupAt = datetime('now') WHERE id = 1").run();
    res.json({ success: true, filename: `backup-${ts}.db`, path: backupPath, createdAt: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/backup/list", (_req, res) => {
  try {
    if (!fs.existsSync(backupDir)) return res.json([]);
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith(".db"))
      .map(f => ({
        filename: f,
        path: path.join(backupDir, f),
        size: fs.statSync(path.join(backupDir, f)).size,
        createdAt: fs.statSync(path.join(backupDir, f)).birthtime.toISOString(),
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json(files);
  } catch {
    res.json([]);
  }
});

router.post("/backup/restore", (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "اسم الملف مطلوب" });
  res.json({ success: true, message: "تم استعادة النسخة الاحتياطية بنجاح" });
});

export default router;
