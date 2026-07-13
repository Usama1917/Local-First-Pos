import type { Request } from "express";

/**
 * The user who initiated the request. RBAC in this app is client-side (there is no
 * server session), so the SPA attaches the logged-in user's name to every request as
 * an `X-Actor-Name` header. Arabic names are URL-encoded on the client because HTTP
 * header values must be latin1. Returns null for anonymous / legacy requests.
 */
export function actorName(req: Request): string | null {
  const raw = req.headers["x-actor-name"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  try {
    const decoded = decodeURIComponent(v).trim();
    return decoded || null;
  } catch {
    return (v as string).trim() || null;
  }
}
