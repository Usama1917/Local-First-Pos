import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

// Shape a DB row for the client. Passwords ARE returned: the manager is allowed
// to view them (explicit product decision for this local single-shop system).
function shape(row: any) {
  if (!row) return row;
  let permissions: string[] = [];
  try { permissions = JSON.parse(row.permissions || "[]"); } catch { permissions = []; }
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    password: row.password,
    role: row.role,
    permissions,
    isActive: !!row.isActive,
    createdAt: row.createdAt,
  };
}

function activeAdminCount(excludeId?: number): number {
  const r = db.prepare(
    "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND isActive = 1 AND id != ?",
  ).get(excludeId ?? -1) as any;
  return r?.c || 0;
}

router.get("/users", (_req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY role = 'admin' DESC, name").all();
  res.json({ items: rows.map(shape), total: rows.length });
});

router.post("/users", (req, res) => {
  const { username, password, name, role = "staff", permissions = [], isActive = true } = req.body || {};
  if (!username || !password || !name) return res.status(400).json({ error: "اسم المستخدم وكلمة المرور والاسم مطلوبين" });
  const exists = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  if (exists) return res.status(400).json({ error: "اسم المستخدم مستخدم بالفعل" });
  const perms = role === "admin" ? null : JSON.stringify(Array.isArray(permissions) ? permissions : []);
  const r = db.prepare(
    "INSERT INTO users (username, password, name, role, permissions, isActive) VALUES (?,?,?,?,?,?)",
  ).run(username, password, name, role, perms, isActive ? 1 : 0);
  res.status(201).json(shape(db.prepare("SELECT * FROM users WHERE id = ?").get(r.lastInsertRowid)));
});

router.patch("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!user) return res.status(404).json({ error: "غير موجود" });

  const { username, password, name, role, permissions, isActive } = req.body || {};

  // Guard: never strip the last active admin (by demotion or deactivation).
  const wasAdmin = user.role === "admin" && user.isActive;
  const becomesNonAdmin = role !== undefined && role !== "admin";
  const becomesInactive = isActive !== undefined && !isActive;
  if (wasAdmin && (becomesNonAdmin || becomesInactive) && activeAdminCount(id) === 0) {
    return res.status(400).json({ error: "لا يمكن تعطيل أو تخفيض آخر مدير في النظام" });
  }

  if (username && username !== user.username) {
    const exists = db.prepare("SELECT 1 FROM users WHERE username = ? AND id != ?").get(username, id);
    if (exists) return res.status(400).json({ error: "اسم المستخدم مستخدم بالفعل" });
  }

  // Effective role after this update decides whether permissions are stored.
  const newRole = role ?? user.role;
  let permsValue: string | null | undefined = undefined;
  if (newRole === "admin") {
    permsValue = null; // admins bypass permissions
  } else if (permissions !== undefined) {
    permsValue = JSON.stringify(Array.isArray(permissions) ? permissions : []);
  } else if (role !== undefined && role !== user.role) {
    // demoted to non-admin without explicit perms → start empty
    permsValue = "[]";
  }

  db.prepare(`
    UPDATE users SET
      username = COALESCE(?, username),
      password = COALESCE(?, password),
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      permissions = CASE WHEN ? THEN ? ELSE permissions END,
      isActive = COALESCE(?, isActive)
    WHERE id = ?
  `).run(
    username || null,
    password || null,
    name || null,
    role || null,
    permsValue !== undefined ? 1 : 0,
    permsValue ?? null,
    isActive !== undefined ? (isActive ? 1 : 0) : null,
    id,
  );

  res.json(shape(db.prepare("SELECT * FROM users WHERE id = ?").get(id)));
});

router.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
  if (!user) return res.status(404).json({ error: "غير موجود" });
  if (user.role === "admin" && user.isActive && activeAdminCount(id) === 0) {
    return res.status(400).json({ error: "لا يمكن حذف آخر مدير في النظام" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ success: true });
});

export default router;
