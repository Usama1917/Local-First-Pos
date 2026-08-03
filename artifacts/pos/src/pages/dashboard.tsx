import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetRecentInvoices,
  getGetRecentInvoicesQueryKey,
  useGetRecentQuotations,
  getGetRecentQuotationsQueryKey,
  useGetLowStockProducts,
  getGetLowStockProductsQueryKey,
  useGetUncountedStockSummary,
  getGetUncountedStockSummaryQueryKey,
  useListStockMovements,
  getListStockMovementsQueryKey,
  useCreateStockCount,
  getListStockCountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Receipt, FileText, Package, ShoppingCart, TrendingUp, AlertCircle, Clock, PlusCircle, Zap, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

const MOVE_LABELS: Record<string, string> = {
  sale: "بيع", purchase: "شراء", opening: "افتتاحي", adjustment: "تعديل",
  return: "مرتجع", count_positive: "جرد زيادة", count_negative: "جرد نقص",
};

/** SQLite stores datetime('now') as UTC "YYYY-MM-DD HH:MM:SS" — read it as UTC, show local. */
const fmtWhen = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? v : d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
};

export default function Dashboard() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() }
  });

  const { data: recentInvoices, isLoading: isInvoicesLoading } = useGetRecentInvoices({
    query: { queryKey: getGetRecentInvoicesQueryKey() }
  });

  const { data: recentQuotations, isLoading: isQuotationsLoading } = useGetRecentQuotations({
    query: { queryKey: getGetRecentQuotationsQueryKey() }
  });

  const { data: lowStockProducts, isLoading: isLowStockLoading } = useGetLowStockProducts({
    query: { queryKey: getGetLowStockProductsQueryKey() }
  });

  // Stock that moved in or out and hasn't been verified against the shelf yet.
  const { data: uncounted } = useGetUncountedStockSummary({
    query: { queryKey: getGetUncountedStockSummaryQueryKey() }
  });
  const uncountedParams = { uncounted: true, limit: 100 };
  const { data: pendingMoves, isLoading: isMovesLoading } = useListStockMovements(uncountedParams, {
    query: { queryKey: getListStockMovementsQueryKey(uncountedParams) }
  });
  const createCount = useCreateStockCount();

  const pendingProducts = (uncounted as any)?.products || 0;
  const moves: any[] = (pendingMoves as any)?.items || [];

  const startQuickCount = async () => {
    try {
      const r = await createCount.mutateAsync({ data: { scope: "uncounted" } });
      qc.invalidateQueries({ queryKey: getListStockCountsQueryKey() });
      toast.success("تم فتح جلسة جرد سريعة");
      setLocation(`/inventory?count=${(r as any).id}`);
    } catch (e: any) {
      toast.error(e.message || "تعذّر فتح الجلسة");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={startQuickCount}
            disabled={createCount.isPending || pendingProducts === 0}
            title={pendingProducts === 0
              ? "لا توجد حركات مخزن تحتاج جرد"
              : `جرد ${pendingProducts} منتج تحركوا ولسه ما اتجردوش`}
          >
            <Zap className="h-4 w-4 ml-2" />
            جلسة جرد سريعة
            {pendingProducts > 0 && (
              <span className="mr-2 rounded-full bg-muted px-1.5 text-xs">{pendingProducts}</span>
            )}
          </Button>
          <Link href="/pos" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2">
            <ShoppingCart className="h-4 w-4" />
            فاتورة مبيعات جديدة
          </Link>
          <Link href="/quotations" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2">
            <FileText className="h-4 w-4" />
            تسعيرة جديدة
          </Link>
          <Link href="/purchases" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 gap-2">
            <PlusCircle className="h-4 w-4" />
            فاتورة مشتريات
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">مبيعات اليوم</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isSummaryLoading ? "..." : formatCurrency(summary?.todaySales)}</div>
            <p className="text-xs text-muted-foreground mt-1 flex gap-2">
              <span className="text-emerald-600 dark:text-emerald-400">نقدي: {formatCurrency(summary?.todayCash)}</span>
              <span className="text-amber-600 dark:text-amber-400">آجل: {formatCurrency(summary?.todayCredit)}</span>
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">فواتير اليوم</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isSummaryLoading ? "..." : formatNumber(summary?.todayInvoicesCount)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              فاتورة
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المديونيات</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isSummaryLoading ? "..." : formatCurrency(summary?.totalReceivables)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              للعملاء
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المستحقات</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isSummaryLoading ? "..." : formatCurrency(summary?.totalPayables)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              للموردين
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>أحدث فواتير المبيعات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[420px] overflow-y-auto pl-2">
              {isInvoicesLoading ? (
                <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
              ) : recentInvoices?.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">لا توجد فواتير مبيعات اليوم</div>
              ) : (
                recentInvoices?.map(invoice => (
                  <Link
                    key={invoice.id}
                    href={`/sales?open=${invoice.id}`}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card nav-hover cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <Receipt className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-semibold">{invoice.serial}</div>
                        <div className="text-xs text-muted-foreground">{invoice.customerName || 'عميل نقدي'}</div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold">{formatCurrency(invoice.total)}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.paymentType === 'cash' ? 'نقدي' : invoice.paymentType === 'credit' ? 'آجل' : 'جزئي'}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              تنبيهات النفاذ
            </CardTitle>
          </CardHeader>
          <CardContent>
             <div className="space-y-4 max-h-[420px] overflow-y-auto pl-2">
              {isLowStockLoading ? (
                <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
              ) : lowStockProducts?.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">جميع المنتجات متوفرة بالمخزن</div>
              ) : (
                lowStockProducts?.map(product => (
                  <div key={product.id} className="flex items-center justify-between p-2 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm truncate max-w-[200px]">{product.nameAr}</div>
                      <div className="text-xs text-muted-foreground">{product.sku}</div>
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-destructive">{product.currentStock}</div>
                      <div className="text-xs text-muted-foreground">الحد: {product.minStock}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock that moved but hasn't been verified against the shelf yet — the
          backlog the quick count session clears. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              حركات المخزن
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {moves.length === 0
                ? "كل الحركات متجردة"
                : `${formatNumber(moves.length)} حركة على ${formatNumber(pendingProducts)} منتج لسه ما اتجردتش`}
            </p>
          </div>
          {pendingProducts > 0 && (
            <Button size="sm" onClick={startQuickCount} disabled={createCount.isPending}>
              <Zap className="h-4 w-4 ml-2" />
              جرد سريع
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[360px] overflow-y-auto">
            {isMovesLoading ? (
              <div className="py-8 text-center text-muted-foreground">جاري التحميل...</div>
            ) : moves.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Package className="mx-auto mb-2 h-10 w-10 opacity-30" />
                مفيش حركات مخزن مستنية جرد
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-right">
                    <th className="p-3">المنتج</th>
                    <th className="p-3">الحركة</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">الرصيد قبل ← بعد</th>
                    <th className="p-3">المستند</th>
                    <th className="p-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {moves.map((m) => {
                    // balanceAfter − balanceBefore is the signed truth; `quantity` is stored absolute.
                    const delta = (m.balanceAfter ?? 0) - (m.balanceBefore ?? 0);
                    const isIn = delta >= 0;
                    return (
                      <tr key={m.id} className="border-b nav-hover">
                        <td className="p-3">
                          <div className="font-medium">{m.productName || `#${m.productId}`}</div>
                          <div className="text-xs text-muted-foreground">{m.sku}</div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 text-xs ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {isIn ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {MOVE_LABELS[m.type] || m.type}
                          </span>
                        </td>
                        <td className={`p-3 text-center font-semibold ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {isIn ? "+" : "−"}{formatNumber(Math.abs(delta))}{m.unitName ? ` ${m.unitName}` : ""}
                        </td>
                        <td className="p-3 text-center text-muted-foreground">
                          {formatNumber(m.balanceBefore)} ← {formatNumber(m.balanceAfter)}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{m.notes || "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{fmtWhen(m.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
