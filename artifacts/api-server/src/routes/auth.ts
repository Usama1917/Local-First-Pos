import { Router } from "express";
import db from "../lib/db.js";
import { createSession, destroySession, bearerToken, getSession } from "../lib/session.js";

const router = Router();

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND isActive = 1").get(username) as any;
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  let permissions: string[] = [];
  try { permissions = JSON.parse(user.permissions || "[]"); } catch { permissions = []; }
  // Issue a server-side session token the SPA must send on every request.
  const token = createSession(user.id);
  res.json({ id: user.id, username: user.username, name: user.name, role: user.role, permissions, token });
});

router.get("/auth/me", (req, res) => {
  const session = getSession(bearerToken(req));
  if (!session) return res.status(401).json({ error: "غير مسجّل الدخول" });
  res.json({ id: session.userId, username: session.username, name: session.name, role: session.role, permissions: session.permissions });
});

router.post("/auth/logout", (req, res) => {
  destroySession(bearerToken(req));
  res.json({ success: true });
});

export default router;
