import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND isActive = 1").get(username) as any;
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  (req as any).session = { userId: user.id, username: user.username, role: user.role, name: user.name };
  let permissions: string[] = [];
  try { permissions = JSON.parse(user.permissions || "[]"); } catch { permissions = []; }
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role, permissions });
});

router.get("/auth/me", (req, res) => {
  res.json({ id: 1, username: "admin", name: "المدير", role: "admin" });
});

router.post("/auth/logout", (_req, res) => {
  res.json({ success: true });
});

export default router;
