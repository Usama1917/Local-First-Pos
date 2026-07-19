import type { Request, Response, NextFunction } from "express";
import { getSession, bearerToken } from "../lib/session.js";

// Endpoints reachable without a valid session (the login form itself + health).
const PUBLIC = new Set(["POST /auth/login", "GET /healthz"]);

/**
 * Gate every /api request behind a valid session token. The SPA sends
 * `Authorization: Bearer <token>` (issued at login). Public endpoints are
 * whitelisted; everything else 401s without a live session. The resolved
 * session is attached to req for downstream role checks and audit.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // req.path here is relative to the /api mount (e.g. "/auth/login", "/sales/3").
  const key = `${req.method} ${req.path}`;
  if (PUBLIC.has(key)) return next();

  const session = getSession(bearerToken(req));
  if (!session) return res.status(401).json({ error: "انتهت الجلسة — سجّل الدخول من جديد" });
  (req as any).session = session;
  next();
}

/** Restrict a route to admins (must run after requireAuth). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session;
  if (!session || session.role !== "admin") {
    return res.status(403).json({ error: "هذا الإجراء يتطلب صلاحية المدير" });
  }
  next();
}
