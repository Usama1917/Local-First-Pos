/**
 * Per-invoice profit, as SQL fragments correlated on the alias `si`
 * (sales_invoices). One definition shared by the invoices list and the
 * invoice-profit report so the two numbers can never disagree.
 *
 *   profit = total − cost of goods − craftsman commission + returns effect
 *
 * - Cost uses the `costAtSale` snapshot frozen at finalize; drafts (no snapshot
 *   yet) fall back to today's product cost, same as the profit report.
 * - Returns effect for returns made against this invoice: returned revenue is
 *   lost, a restocked item gives its cost back (a damaged one doesn't), and
 *   exchange items add their revenue minus their cost.
 *
 * Internal use only — never put these fields on a customer-facing print.
 */
const LINE_COST = "COALESCE(x.costAtSale, xp.trueCost, 0)";

export const INVOICE_COST_SQL = `(
  SELECT COALESCE(SUM(x.quantity * ${LINE_COST}), 0)
  FROM sales_invoice_items x LEFT JOIN products xp ON xp.id = x.productId
  WHERE x.invoiceId = si.id)`;

export const INVOICE_ZERO_COST_SQL = `(
  SELECT COUNT(*)
  FROM sales_invoice_items x LEFT JOIN products xp ON xp.id = x.productId
  WHERE x.invoiceId = si.id AND ${LINE_COST} <= 0)`;

export const INVOICE_RETURNS_SQL = `(
  SELECT COALESCE(SUM(CASE
    WHEN ri.kind = 'returned'
      THEN -ri.total + CASE WHEN ri.restock = 1 THEN ri.quantity * COALESCE(ri.costAtSale, rp.trueCost, 0) ELSE 0 END
    ELSE ri.total - ri.quantity * COALESCE(ri.costAtSale, rp.trueCost, 0)
  END), 0)
  FROM return_items ri
  JOIN returns r ON r.id = ri.returnId
  LEFT JOIN products rp ON rp.id = ri.productId
  WHERE r.originalInvoiceId = si.id)`;

/** Columns to append to a SELECT over `sales_invoices si`. */
export const INVOICE_PROFIT_COLUMNS = `
  ${INVOICE_COST_SQL} as costTotal,
  ${INVOICE_RETURNS_SQL} as returnsProfit,
  ${INVOICE_ZERO_COST_SQL} as zeroCostLines,
  ROUND(si.total - si.craftsmanCommission - ${INVOICE_COST_SQL} + ${INVOICE_RETURNS_SQL}, 2) as profit`;
