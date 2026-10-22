import { Router } from "express";
import db from "../lib/db.js";
import { createSession, destroySession, bearerToken, getSession } from "../lib/session.js";
import { verifyPassword } from "../lib/password.js";
import { authEnabled, hosted } from "../lib/runtime.js";

const router = Router();
const attempts = new Map<string, { count: number; until: number }>();

// The browser uses this to decide whether the optional login page is needed.
router.get("/auth/config", (_req, res) => {
  res.json({ authEnabled });
});

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string" ||
      username.length > 100 || password.length > 256) {
    return res.status(400).json({ error: "بيانات الدخول غير صالحة" });
  }
  if (hosted) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    // Global cap bounds CPU spent on password hashing even with rotating IPs.
    const keys = ["global", `ip:${req.ip || req.socket.remoteAddress}`];
    for (const key of keys) {
      const entry = attempts.get(key);
      if (entry && entry.count >= (key === "global" ? 200 : 20)) {
        res.setHeader("Retry-After", String(Math.ceil((entry.until - now) / 1000)));
        return res.status(429).json({ error: "محاولات دخول كثيرة — حاول بعد ١٥ دقيقة" });
      }
    }
    for (const key of keys) {
      const entry = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
      entry.count++;
      attempts.set(key, entry);
    }
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ? AND isActive = 1").get(username) as any;
  if (!user || !verifyPassword(password, user.password)) {
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
