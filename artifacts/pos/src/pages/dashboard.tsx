import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  useGetRecentInvoices,
  getGetRecentInvoicesQueryKey,
  useGetRecentQuotations,
  getGetRecentQuotationsQueryKey,
  useGetLowStockProducts,
  getGetLowStockProductsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Link } from "wouter";
import { Receipt, FileText, Package, ShoppingCart, TrendingUp, AlertCircle, Clock, PlusCircle } from "lucide-react";

export default function Dashboard() {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">لوحة التحكم</h1>
        <div className="flex items-center gap-2">
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
            <div className="space-y-4">
              {isInvoicesLoading ? (
                <div className="text-center py-4 text-muted-foreground">جاري التحميل...</div>
              ) : recentInvoices?.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">لا توجد فواتير مبيعات اليوم</div>
              ) : (
                recentInvoices?.map(invoice => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg bg-card nav-hover">
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
                  </div>
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
    </div>
  );
}
