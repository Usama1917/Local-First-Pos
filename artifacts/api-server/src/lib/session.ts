import { randomBytes } from "node:crypto";
import db from "./db.js";

export interface Session {
  token: string;
  userId: number;
  username: string;
  name: string;
  role: string;
  permissions: string[];
}

/** Issue a fresh opaque session token for a user and persist it. */
export function createSession(userId: number): string {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, userId) VALUES (?, ?)").run(token, userId);
  return token;
}

/** Resolve a bearer token to its live session (joins the current user row), or null. */
export function getSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, u.id as userId, u.username, u.name, u.role, u.permissions, u.isActive
    FROM sessions s JOIN users u ON s.userId = u.id
    WHERE s.token = ?
  `).get(token) as any;
  if (!row || !row.isActive) return null;
  let permissions: string[] = [];
  try { permissions = JSON.parse(row.permissions || "[]"); } catch { permissions = []; }
  return { token: row.token, userId: row.userId, username: row.username, name: row.name, role: row.role, permissions };
}

export function destroySession(token: string | undefined | null): void {
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** Extract the bearer token from the Authorization header. */
export function bearerToken(req: { headers: Record<string, any> }): string | null {
  const h = req.headers["authorization"] || req.headers["Authorization"];
  const v = Array.isArray(h) ? h[0] : h;
  if (typeof v !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(v.trim());
  return m ? m[1].trim() : null;
}
