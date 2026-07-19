import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

router.get("/debts/customers", (_req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.phone, c.area,
      COALESCE(c.openingBalance, 0)
        + COALESCE(SUM(CASE WHEN si.status IN ('finalized','partially_paid','credit','paid') THEN si.remainingAmount ELSE 0 END), 0)
        + COALESCE((SELECT SUM(r.netAmount) FROM returns r WHERE r.customerId = c.id AND r.settlementType = 'account'), 0)
        - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customerId = c.id), 0) as balance,
      COUNT(CASE WHEN si.status IN ('finalized','partially_paid','credit','paid') AND si.remainingAmount > 0 THEN 1 END) as openInvoices
    FROM customers c
    LEFT JOIN sales_invoices si ON si.customerId = c.id
    WHERE c.isActive = 1
    GROUP BY c.id
    HAVING balance > 0
    ORDER BY balance DESC
  `).all();
  res.json(rows);
});

router.get("/debts/suppliers", (_req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.name, s.phone,
      COALESCE(s.openingBalance, 0)
        + COALESCE(SUM(CASE WHEN pi.status IN ('finalized','partially_paid','credit','paid') THEN pi.remainingAmount ELSE 0 END), 0)
        - COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplierId = s.id), 0) as balance,
      COUNT(CASE WHEN pi.status IN ('finalized','partially_paid','credit','paid') AND pi.remainingAmount > 0 THEN 1 END) as openInvoices
    FROM suppliers s
    LEFT JOIN purchase_invoices pi ON pi.supplierId = s.id
    WHERE s.isActive = 1
    GROUP BY s.id
    HAVING balance > 0
    ORDER BY balance DESC
  `).all();
  res.json(rows);
});

export default router;
