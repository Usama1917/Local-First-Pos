import type { Request, Response, NextFunction } from "express";
import type { Session } from "../lib/session.js";
import { hosted } from "../lib/runtime.js";

// Cloud page capabilities, including the lookups required by other screens.
// These are workflow permissions, not per-field/row-level access controls.
const owners: Record<string, string[]> = {
  dashboard: ["/"], products: ["/products"], customers: ["/customers"],
  craftsmen: ["/craftsmen"], "craftsman-payouts": ["/craftsmen"],
  suppliers: ["/suppliers"], quotations: ["/quotations"],
  sales: ["/pos", "/sales"], purchases: ["/purchases"], returns: ["/returns"],
  stock: ["/inventory"], "stock-counts": ["/inventory"],
  debts: ["/debts"], reports: ["/reports"],
  expenses: ["/expenses"], "recurring-expenses": ["/expenses"],
  categories: ["/products", "/settings"],
  brands: ["/products", "/suppliers", "/settings"],
  units: ["/products", "/settings"],
};
const draftOwners: Record<string, string[]> = {
  sales_invoice: ["/pos"], quotation: ["/quotations"], purchase: ["/purchases"],
};

export function requirePermissions(req: Request, res: Response, next: NextFunction) {
  if (!hosted) return next(); // preserve the local shop's current permission policy
  const session = (req as Request & { session?: Session }).session;
  if (!session) return next(); // requireAuth already checked public routes
  if (session.role === "admin") return next();
  const can = (keys: string[]) => keys.some(key => session.permissions.includes(key));
  let pathname: string;
  try {
    if (/%2f|%5c/i.test(req.path)) throw new Error("Encoded path separator");
    pathname = decodeURIComponent(req.path).toLowerCase().replace(/\/+$/, "");
  } catch {
    return res.status(400).json({ error: "مسار غير صالح" });
  }
  const [, root, id, action] = pathname.split("/");
  const read = req.method === "GET" || req.method === "HEAD";
  const deny = () => res.status(403).json({ error: "ليس لديك صلاحية لهذا الإجراء" });
  if (root === "auth") return next();
  if (root === "settings") return read ? next() : deny();
  if (root === "users" || root === "backup") return deny();

  if (root === "drafts") {
    const type = id || (req.method === "POST" ? req.body?.type : req.query.type);
    // Unfiltered lists would leak drafts belonging to other workflows.
    return typeof type === "string" && can(draftOwners[type] || []) ? next() : deny();
  }
  if (root === "delete-preview") return can(owners[id] || []) ? next() : deny();
  if (root === "quotations" && action === "convert" && !can(["/pos", "/sales"])) return deny();
  if (root === "sales" && action === "amend" && !can(["/pos"])) return deny();

  let required = owners[root] || [];
  if (read) {
    if (root === "products" && id !== "next-barcode" && action !== "movements") {
      required = ["/products", "/pos", "/quotations", "/purchases", "/inventory", "/returns", "/reports"];
    } else if (["categories", "brands", "units"].includes(root)) {
      required = ["/products", "/pos", "/quotations", "/purchases", "/inventory", "/suppliers", "/settings", "/reports"];
    } else if (root === "customers" && !action) {
      required = ["/customers", "/pos", "/quotations", "/sales", "/returns", "/debts", "/craftsmen", "/reports"];
    } else if (root === "customers" && ["payments", "statement"].includes(action)) {
      required = ["/customers", "/debts"];
    } else if (root === "craftsmen" && !action) {
      required = ["/craftsmen", "/pos", "/quotations", "/sales", "/reports"];
    } else if (root === "suppliers" && !action) {
      required = ["/suppliers", "/products", "/purchases", "/debts", "/reports"];
    } else if (root === "suppliers" && action === "payments") {
      required = ["/suppliers", "/debts"];
    } else if (root === "expenses" && id === "due-summary") {
      required = ["/expenses", "/"];
    }
  } else if (req.method === "POST") {
    if (root === "customers" && !id) required = ["/customers", "/pos", "/quotations"];
    if (root === "craftsmen" && !id) required = ["/craftsmen", "/pos", "/quotations"];
    if (root === "customers" && action === "payments") required = ["/customers", "/debts"];
    if (root === "suppliers" && action === "payments") required = ["/suppliers", "/debts"];
  }
  return can(required) ? next() : deny();
}
