import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { hosted } from "./runtime.js";

const OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function isPasswordHash(value: string): boolean {
  return /^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(value);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32, OPTIONS).toString("hex");
  return `scrypt-v1$${salt}$${hash}`;
}

export function storePassword(password: string, alreadyHashed = false): string {
  // Do not downgrade a migrated account if a cloud backup is used locally.
  return hosted || alreadyHashed ? hashPassword(password) : password;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (isPasswordHash(stored)) {
    const [, salt, hash] = stored.split("$");
    return timingSafeEqual(scryptSync(password, salt, 32, OPTIONS), Buffer.from(hash, "hex"));
  }
  if (hosted) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validNewPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= (hosted ? 12 : 1) && value.length <= 256;
}
