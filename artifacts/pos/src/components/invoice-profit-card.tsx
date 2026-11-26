import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, TrendingUp, TrendingDown, AlertTriangle, Lock } from "lucide-react";

const HIDE_KEY = "pos_hide_profit";

/** Money with the app's sign convention ("- 440.00 ج.م"), safe inside RTL text. */
export const signedCurrency = (v: number) => `${v < 0 ? "- " : ""}${formatCurrency(Math.abs(v))}`;

function readHidden(): boolean {
  try { return localStorage.getItem(HIDE_KEY) === "1"; } catch { return false; }
}

/**
 * Internal profit of the invoice being built in the cashier. Shop-only: the card
 * carries `no-print` and is never part of the customer's invoice. The eye toggle
 * hides the numbers (remembered per browser) when a customer can see the screen.
 */
export function InvoiceProfitCard({
  total,
  cost,
  commission,
  missingCost,
  lineCount,
  className,
}: {
  total: number;
  cost: number;
  commission: number;
  /** Number of cart lines whose cost is unknown (profit is overstated). */
  missingCost: number;
  /** Number of lines in the cart. */
  lineCount: number;
  className?: string;
}) {
  const [hidden, setHidden] = useState(readHidden);
  const toggle = () => {
    setHidden((h) => {
      try { localStorage.setItem(HIDE_KEY, h ? "0" : "1"); } catch { /* private mode */ }
      return !h;
    });
  };

  const profit = total - cost - commission;
  const margin = total > 0 ? (profit / total) * 100 : 0;
  const loss = profit < 0;
  // No line has a known cost: any number would just be the invoice total again.
  const unknown = lineCount > 0 && missingCost >= lineCount;
  const mask = "••••";

  return (
    <Card className={cn("no-print", className)}>
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            {loss ? <TrendingDown className="h-4 w-4 text-destructive" /> : <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            صافي الربح
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggle}
            title={hidden ? "إظهار الربح" : "إخفاء الربح عن الشاشة"}
            aria-label={hidden ? "إظهار الربح" : "إخفاء الربح"}
          >
            {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>

        {!hidden && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex justify-between"><span>إجمالي الفاتورة</span><span className="tabular-nums">{formatCurrency(total)}</span></div>
            <div className="flex justify-between"><span>تكلفة البضاعة</span><span className="tabular-nums">{unknown ? "؟" : signedCurrency(-cost)}</span></div>
            {commission > 0 && (
              <div className="flex justify-between"><span>عمولة الصنايعي</span><span className="tabular-nums">{signedCurrency(-commission)}</span></div>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2 border-t pt-2">
          <span
            className={cn(
              "text-xl font-bold tabular-nums",
              hidden || unknown ? "text-muted-foreground" : loss ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {hidden ? mask : unknown ? "—" : signedCurrency(profit)}
          </span>
          {!hidden && !unknown && total > 0 && (
            <span
              dir="ltr"
              className={cn(
                "rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                loss ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
              )}
              title="نسبة الربح من إجمالي الفاتورة"
            >
              {margin.toFixed(1)}%
            </span>
          )}
        </div>

        {!hidden && missingCost > 0 && (
          <p className="flex items-start gap-1 text-[11px] leading-tight text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            {unknown
              ? "سعر التكلفة مش متسجل للأصناف دي — سجّله من صفحة المنتجات"
              : `${missingCost} صنف من غير تكلفة — الربح الحقيقي أقل من كده`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Statuses whose profit is real (the goods actually left). */
export const isLiveInvoice = (status?: string) => !!status && !["draft", "cancelled", "amended"].includes(status);

/** Profit + margin %, coloured by sign. Used in the invoices list and the report. */
export function ProfitAmount({ profit, total, zeroCostLines }: { profit: number; total: number; zeroCostLines?: number }) {
  const margin = total > 0 ? (profit / total) * 100 : 0;
  const loss = profit < 0;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cn("whitespace-nowrap font-semibold tabular-nums", loss ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
        {signedCurrency(profit)}
      </span>
      <span dir="ltr" className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
        {!!zeroCostLines && (
          <span title={`${zeroCostLines} صنف من غير تكلفة — الربح ممكن يكون أقل`}>
            <AlertTriangle className="h-3 w-3 text-amber-600" />
          </span>
        )}
        {margin.toFixed(1)}%
      </span>
    </span>
  );
}

/** Internal breakdown under an opened invoice. Lives OUTSIDE `.invoice-print`. */
export function InvoiceProfitBreakdown({ inv }: { inv: any }) {
  if (!isLiveInvoice(inv?.status) || inv?.profit == null) return null;
  const total = Number(inv.total) || 0;
  const profit = Number(inv.profit) || 0;
  const margin = total > 0 ? (profit / total) * 100 : 0;
  const rows: [string, number][] = [
    ["إجمالي الفاتورة", total],
    ["تكلفة البضاعة (وقت البيع)", -(Number(inv.costTotal) || 0)],
  ];
  if (Number(inv.craftsmanCommission) > 0) rows.push(["عمولة الصنايعي", -Number(inv.craftsmanCommission)]);
  if (Number(inv.returnsProfit)) rows.push(["أثر المرتجعات والاستبدال", Number(inv.returnsProfit)]);
  return (
    <div className="no-print mx-3 mb-4 rounded-lg border border-dashed bg-muted/40 p-4 text-sm sm:mx-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" /> ربح الفاتورة (للمحل بس — مش بيتطبع)
        </span>
        <span dir="ltr" className={cn("rounded-md px-1.5 py-0.5 text-xs font-semibold", profit < 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
          {margin.toFixed(1)}%
        </span>
      </div>
      <div className="space-y-1">
        {rows.map(([label, v]) => (
          <div key={label} className="flex justify-between text-muted-foreground">
            <span>{label}</span>
            <span className="tabular-nums">{signedCurrency(v)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-1 text-base font-bold">
          <span>صافي ربح الفاتورة</span>
          <span className={cn("tabular-nums", profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>{signedCurrency(profit)}</span>
        </div>
      </div>
      {Number(inv.zeroCostLines) > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> {inv.zeroCostLines} صنف من غير تكلفة مسجّلة — الربح الحقيقي أقل من كده
        </p>
      )}
    </div>
  );
}
