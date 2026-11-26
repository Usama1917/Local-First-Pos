import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useGetInvoiceProfitReport } from "@workspace/api-client-react";
import { Table } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProfitAmount, signedCurrency } from "@/components/invoice-profit-card";
import { Receipt, Search, AlertTriangle, HardHat } from "lucide-react";

type Sort = "date" | "profit-desc" | "profit-asc" | "margin-desc" | "margin-asc";

/**
 * «أرباح الفواتير» — every live invoice in the range with its own profit and
 * margin. Same formula as the invoices list. Click a row to open the invoice.
 */
export function InvoiceProfitTable({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const params = { dateFrom, dateTo };
  const { data, isLoading } = useGetInvoiceProfitReport(params);
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("date");

  const report = data as any;
  const totals = report?.totals;
  const rows = useMemo(() => {
    const q = search.trim();
    let list: any[] = (report?.items || []).filter((r: any) =>
      !q || r.serial?.includes(q) || r.customerName?.includes(q) || r.craftsmanName?.includes(q));
    const by: Record<Sort, (a: any, b: any) => number> = {
      date: () => 0, // server order: newest first
      "profit-desc": (a, b) => b.profit - a.profit,
      "profit-asc": (a, b) => a.profit - b.profit,
      "margin-desc": (a, b) => b.margin - a.margin,
      "margin-asc": (a, b) => a.margin - b.margin,
    };
    if (sort !== "date") list = [...list].sort(by[sort]);
    return list;
  }, [report, search, sort]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />أرباح الفواتير</CardTitle>
          {totals && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{formatNumber(totals.invoiceCount)} فاتورة</Badge>
              <span className="text-muted-foreground">الإجمالي {formatCurrency(totals.total)}</span>
              <span className="text-muted-foreground">·</span>
              <span>الربح <span className={cn("font-bold", totals.profit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>{signedCurrency(totals.profit)}</span></span>
              <Badge variant={totals.profit < 0 ? "destructive" : "secondary"}>{totals.margin}%</Badge>
              {totals.lossCount > 0 && <Badge variant="destructive">{totals.lossCount} بخسارة</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pr-9" placeholder="رقم الفاتورة أو اسم العميل / الصنايعي..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">الأحدث الأول</SelectItem>
              <SelectItem value="profit-desc">الأعلى ربحاً</SelectItem>
              <SelectItem value="profit-asc">الأقل ربحاً</SelectItem>
              <SelectItem value="margin-desc">أعلى نسبة ربح</SelectItem>
              <SelectItem value="margin-asc">أقل نسبة ربح</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الفاتورة</th>
              <th className="p-3">العميل</th>
              <th className="p-3 text-left">الإجمالي</th>
              <th className="p-3 text-left">التكلفة</th>
              <th className="p-3 text-left">العمولة</th>
              <th className="p-3 text-left">المرتجعات</th>
              <th className="p-3 text-left">الربح / النسبة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري الحساب...</td></tr>}
            {!isLoading && rows.map((r: any) => (
              <tr
                key={r.id}
                className="cursor-pointer border-b nav-hover"
                onClick={() => setLocation(`/sales?open=${r.id}`)}
                title="افتح الفاتورة"
              >
                <td className="p-3">
                  <div className="font-mono font-medium text-primary">{r.serial}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</div>
                </td>
                <td className="p-3">
                  {r.customerName || <span className="text-muted-foreground">نقدي</span>}
                  {r.craftsmanName && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><HardHat className="h-3 w-3" />{r.craftsmanName}</div>
                  )}
                </td>
                <td className="p-3 text-left tabular-nums">{formatCurrency(r.total)}</td>
                <td className="p-3 text-left tabular-nums text-muted-foreground">{formatCurrency(r.costTotal)}</td>
                <td className="p-3 text-left tabular-nums text-muted-foreground">{r.commission ? formatCurrency(r.commission) : "—"}</td>
                <td className="p-3 text-left tabular-nums text-muted-foreground">{r.returnsProfit ? signedCurrency(r.returnsProfit) : "—"}</td>
                <td className="p-3 text-left"><ProfitAmount profit={r.profit} total={r.total} zeroCostLines={r.zeroCostLines} /></td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد فواتير في الفترة دي</td></tr>
            )}
          </tbody>
        </Table>
        {totals?.zeroCostInvoices > 0 && (
          <p className="flex items-center gap-1.5 border-t p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totals.zeroCostInvoices} فاتورة فيها أصناف من غير تكلفة مسجّلة — ربحها ظاهر أعلى من الحقيقي. سجّل تكلفة المنتج من صفحة المنتجات.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
