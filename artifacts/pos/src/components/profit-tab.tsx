import { useGetProfitReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, Wallet, HardHat, Package, Coins } from "lucide-react";

/** Money coloured by sign — profit green, loss red. */
function Money({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn(value < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400", className)}>
      {formatCurrency(value)}
    </span>
  );
}

interface Row {
  label: string;
  value: number;
  /** '+' adds, '-' subtracts, 'total' is a computed subtotal line. */
  kind: "add" | "sub" | "total" | "grand";
  hint?: string;
}

/**
 * The P&L walk: every line the owner needs to see to trust the bottom number, in the
 * order the money actually moves. Rendering it as one list (rather than four cards)
 * is what makes «صافي الربح» auditable instead of a black box.
 */
function ProfitWalk({ p }: { p: any }) {
  const rows: Row[] = [
    { label: "إجمالي الفواتير", value: p.grossSales, kind: "add", hint: `${formatNumber(p.invoiceCount)} فاتورة (بعد خصم ${formatCurrency(p.invoiceDiscount)} خصومات)` },
    { label: "المرتجعات", value: -p.returnedRevenue, kind: "sub", hint: "قيمة البضاعة اللي رجعت من العملاء" },
    { label: "أصناف الاستبدال", value: p.exchangeRevenue, kind: "add", hint: "بضاعة اتصرفت بدل المرتجع" },
    { label: "صافي المبيعات", value: p.revenue, kind: "total" },
    { label: "تكلفة البضاعة المباعة", value: -p.soldCost, kind: "sub", hint: "بسعر التكلفة وقت البيع" },
    { label: "تكلفة مرتجع رجع للمخزن", value: p.recoveredCost, kind: "add", hint: "البضاعة رجعت فتكلفتها اترجعت" },
    { label: "تكلفة أصناف الاستبدال", value: -p.exchangeCost, kind: "sub" },
    { label: "مجمل الربح", value: p.grossProfit, kind: "total", hint: `هامش ${p.grossMargin}%` },
    { label: "عمولات الصنايعية", value: -p.commission, kind: "sub", hint: "العمولة المستحقة على فواتير الفترة" },
    { label: "المصروفات التشغيلية", value: -p.expenses, kind: "sub", hint: `${formatNumber(p.expenseCount)} مصروف (مرتبات، إيجار، وغيره)` },
    { label: "صافي الربح", value: p.netProfit, kind: "grand", hint: `هامش صافي ${p.netMargin}%` },
  ];

  return (
    <Card>
      <CardHeader><CardTitle>تفاصيل الربح — من المبيعات لصافي الربح</CardTitle></CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b last:border-0",
                  r.kind === "total" && "bg-muted/50 font-semibold",
                  r.kind === "grand" && "bg-primary/10 text-base font-bold",
                )}
              >
                <td className="p-3">
                  <div className={cn(r.kind === "add" || r.kind === "sub" ? "pr-4 text-muted-foreground" : "")}>
                    {r.label}
                  </div>
                  {r.hint && <div className="pr-4 text-xs text-muted-foreground/80">{r.hint}</div>}
                </td>
                <td className="p-3 text-left tabular-nums">
                  {r.kind === "total" || r.kind === "grand"
                    ? <Money value={r.value} className={r.kind === "grand" ? "text-lg" : ""} />
                    : <span className={r.value < 0 ? "text-destructive" : "text-foreground"}>
                        {r.value < 0 ? "− " : "+ "}{formatCurrency(Math.abs(r.value))}
                      </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function BreakdownTable({
  title, rows, nameKey, icon: Icon, emptyLabel,
}: {
  title: string; rows: any[]; nameKey: string; icon: any; emptyLabel: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5" />{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr className="text-right">
                <th className="p-3">الصنف</th>
                <th className="p-3 text-left">المبيعات</th>
                <th className="p-3 text-left">التكلفة</th>
                <th className="p-3 text-left">الربح</th>
                <th className="p-3 text-center">الهامش</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b nav-hover">
                  <td className="p-3">
                    <div className="font-medium">{r[nameKey]}</div>
                    {r.sku && <div className="text-xs text-muted-foreground">{r.sku}</div>}
                    {r.qty > 0 && <div className="text-xs text-muted-foreground">الكمية: {formatNumber(r.qty)}</div>}
                  </td>
                  <td className="p-3 text-left tabular-nums">{formatCurrency(r.revenue)}</td>
                  <td className="p-3 text-left tabular-nums text-muted-foreground">{formatCurrency(r.cost)}</td>
                  <td className="p-3 text-left tabular-nums font-semibold"><Money value={r.profit} /></td>
                  <td className="p-3 text-center">
                    <Badge variant={r.profit < 0 ? "destructive" : "secondary"}>{r.margin}%</Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">{emptyLabel}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfitTab({
  dateFrom, dateTo, onRange,
}: {
  dateFrom: string;
  dateTo: string;
  /** Lets the quick-window cards drive the page's shared date range. */
  onRange: (from: string, to: string) => void;
}) {
  const { data, isLoading } = useGetProfitReport({ dateFrom, dateTo });
  const p = data as any;

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">جاري الحساب...</div>;
  if (!p) return <div className="p-8 text-center text-muted-foreground">تعذّر تحميل تقرير الأرباح</div>;

  const windows: any[] = p.windows || [];
  const daily: any[] = p.daily || [];
  const expenseRows: any[] = p.expensesByCategory || [];
  const isSelected = (w: any) => w.dateFrom === dateFrom && w.dateTo === dateTo;

  return (
    <div className="space-y-4">
      {/* Rolling windows — compare at a glance, click to load one into the range. */}
      <div className="grid gap-4 md:grid-cols-3">
        {windows.map((w) => (
          <Card
            key={w.key}
            role="button"
            tabIndex={0}
            onClick={() => onRange(w.dateFrom, w.dateTo)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRange(w.dateFrom, w.dateTo); } }}
            className={cn(
              "cursor-pointer transition-colors hover:border-primary/60",
              isSelected(w) && "border-primary ring-1 ring-primary",
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{w.label}</CardTitle>
              {w.netProfit < 0
                ? <TrendingDown className="h-4 w-4 text-destructive" />
                : <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold"><Money value={w.netProfit} /></div>
              <p className="mt-1 text-xs text-muted-foreground">
                صافي الربح · هامش {w.netMargin}% · مبيعات {formatCurrency(w.revenue)}
              </p>
              <p className="text-xs text-muted-foreground/80">من {w.dateFrom} إلى {w.dateTo}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* The cost snapshot only exists for goods sold after it was introduced; a line
          with no cost makes the profit look bigger than it is, so say it out loud. */}
      {p.zeroCostLines > 0 && (
        <Card className="border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {formatNumber(p.zeroCostLines)} بند من {formatNumber(p.lineCount)} في الفترة دي متسجلّش ليه تكلفة
              (تكلفته صفر) — يعني الربح المعروض أعلى من الحقيقي بقيمة تكلفة البنود دي. اضبط «التكلفة الحقيقية»
              للمنتجات دي من صفحة المنتجات عشان الأرقام تظبط.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">صافي المبيعات</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(p.revenue)}</div>
            <p className="mt-1 text-xs text-muted-foreground">{formatNumber(p.invoiceCount)} فاتورة</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">تكلفة البضاعة</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(p.cogs)}</div>
            <p className="mt-1 text-xs text-muted-foreground">بسعر التكلفة وقت البيع</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مجمل الربح</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><Money value={p.grossProfit} /></div>
            <p className="mt-1 text-xs text-muted-foreground">هامش {p.grossMargin}%</p>
          </CardContent>
        </Card>
        <Card className="border-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">صافي الربح</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold"><Money value={p.netProfit} /></div>
            <p className="mt-1 text-xs text-muted-foreground">بعد العمولات والمصروفات · هامش {p.netMargin}%</p>
          </CardContent>
        </Card>
      </div>

      <ProfitWalk p={p} />

      {daily.length > 0 && (
        <Card>
          <CardHeader><CardTitle>حركة الربح اليومية</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="المبيعات" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cost" name="التكلفة" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="الربح" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              الرسم ده بيوضّح مجمل الربح اليومي (مبيعات − تكلفة) قبل خصم العمولات والمصروفات.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="الربح حسب التصنيف"
          rows={p.byCategory || []}
          nameKey="category"
          icon={Package}
          emptyLabel="لا توجد مبيعات في الفترة دي"
        />
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />المصروفات حسب البند</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-right">
                    <th className="p-3">البند</th>
                    <th className="p-3 text-center">العدد</th>
                    <th className="p-3 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((e, i) => (
                    <tr key={i} className="border-b nav-hover">
                      <td className="p-3 font-medium">{e.category}</td>
                      <td className="p-3 text-center text-muted-foreground">{formatNumber(e.count)}</td>
                      <td className="p-3 text-left font-semibold text-destructive tabular-nums">{formatCurrency(e.total)}</td>
                    </tr>
                  ))}
                  {expenseRows.length === 0 && (
                    <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">
                      مفيش مصروفات مسجلة في الفترة دي
                    </td></tr>
                  )}
                </tbody>
                {expenseRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t bg-muted/50 font-bold">
                      <td className="p-3" colSpan={2}>الإجمالي</td>
                      <td className="p-3 text-left text-destructive tabular-nums">{formatCurrency(p.expenses)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <BreakdownTable
        title="أعلى المنتجات ربحاً"
        rows={p.byProduct || []}
        nameKey="nameAr"
        icon={TrendingUp}
        emptyLabel="لا توجد مبيعات في الفترة دي"
      />

      {p.commission > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HardHat className="h-3.5 w-3.5" />
          عمولات الصنايعية ({formatCurrency(p.commission)}) محسوبة على فواتير الفترة سواء اتصرفت أو لسه مستحقة —
          تفاصيلها في تبويب «عمولات الصنايعية».
        </p>
      )}
    </div>
  );
}
