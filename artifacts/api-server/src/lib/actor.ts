import type { Request } from "express";

/**
 * Audit identity comes from the authenticated server-side session, never a
 * client-controlled display name.
 */
export function actorName(req: Request): string | null {
  return (req as Request & { session?: { name: string } }).session?.name || null;
}
