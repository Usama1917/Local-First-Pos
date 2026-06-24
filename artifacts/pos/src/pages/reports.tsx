import { useState } from "react";
import {
  useGetSalesReport,
  useGetInventoryReport,
  useGetBestSellers,
  useGetCraftsmanCommissionReport,
  useGetPurchasesReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { Calendar, TrendingUp, Package, Star, HardHat, ShoppingBag } from "lucide-react";

function DateRangePicker({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex gap-3 items-center">
      <div className="flex items-center gap-2">
        <Label className="shrink-0">من:</Label>
        <Input type="date" value={from} onChange={e => onFrom(e.target.value)} className="w-36" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="shrink-0">إلى:</Label>
        <Input type="date" value={to} onChange={e => onTo(e.target.value)} className="w-36" />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);

  const { data: salesReport, isLoading: loadSales } = useGetSalesReport({ dateFrom, dateTo });
  const { data: inventoryReport, isLoading: loadInv } = useGetInventoryReport();
  const { data: bestSellers, isLoading: loadBest } = useGetBestSellers({ dateFrom, dateTo, limit: 10 });
  const { data: commissionReport } = useGetCraftsmanCommissionReport({ dateFrom, dateTo });
  const { data: purchasesReport } = useGetPurchasesReport({ dateFrom, dateTo });

  const sales = salesReport as any;
  const inv = inventoryReport as any;
  const best = (bestSellers as any[]) || [];
  const commissions = (commissionReport as any[]) || [];
  const purchases = purchasesReport as any;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <DateRangePicker from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} />
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales"><TrendingUp className="h-4 w-4 ml-1" />المبيعات</TabsTrigger>
          <TabsTrigger value="inventory"><Package className="h-4 w-4 ml-1" />المخزون</TabsTrigger>
          <TabsTrigger value="best"><Star className="h-4 w-4 ml-1" />الأكثر مبيعاً</TabsTrigger>
          <TabsTrigger value="commission"><HardHat className="h-4 w-4 ml-1" />عمولات الصنايعية</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingBag className="h-4 w-4 ml-1" />المشتريات</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          {loadSales ? <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div> : (
            <>
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-primary">{formatCurrency(sales?.summary?.totalSales)}</p>
                  <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(sales?.summary?.totalCash)}</p>
                  <p className="text-xs text-muted-foreground">نقدي</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(sales?.summary?.totalCredit)}</p>
                  <p className="text-xs text-muted-foreground">آجل</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold">{sales?.summary?.totalInvoices}</p>
                  <p className="text-xs text-muted-foreground">عدد الفواتير</p>
                </CardContent></Card>
              </div>
              {sales?.daily?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>المبيعات اليومية</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={sales.daily} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v: any) => [formatCurrency(v), ""]} />
                        <Bar dataKey="sales" fill="hsl(var(--primary))" name="المبيعات" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
              {sales?.byCategory?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>المبيعات حسب التصنيف</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50"><tr>
                        <th className="p-2 text-right">التصنيف</th>
                        <th className="p-2 text-left">المبيعات</th>
                        <th className="p-2 text-left">الكمية</th>
                      </tr></thead>
                      <tbody>
                        {sales.byCategory.map((c: any) => (
                          <tr key={c.category} className="border-b">
                            <td className="p-2 font-medium">{c.category}</td>
                            <td className="p-2 text-left">{formatCurrency(c.sales)}</td>
                            <td className="p-2 text-left text-muted-foreground">{c.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="inventory">
          {loadInv ? <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div> : (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold">{inv?.summary?.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-primary">{formatCurrency(inv?.summary?.totalStockValue)}</p>
                  <p className="text-xs text-muted-foreground">قيمة المخزون</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-destructive">{inv?.summary?.lowStockCount}</p>
                  <p className="text-xs text-muted-foreground">أصناف ناقصة</p>
                </CardContent></Card>
                <Card><CardContent className="p-4">
                  <p className="text-2xl font-bold text-amber-600">{inv?.summary?.outOfStockCount}</p>
                  <p className="text-xs text-muted-foreground">نفد من المخزون</p>
                </CardContent></Card>
              </div>
              <Card><CardContent className="p-0">
                <div className="overflow-y-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr className="text-right">
                        <th className="p-2">المنتج</th>
                        <th className="p-2">التصنيف</th>
                        <th className="p-2 text-center">الرصيد</th>
                        <th className="p-2 text-left">قيمة المخزون</th>
                        <th className="p-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inv?.items?.map((p: any) => (
                        <tr key={p.sku} className="border-b">
                          <td className="p-2 font-medium">{p.nameAr}</td>
                          <td className="p-2 text-muted-foreground">{p.categoryName}</td>
                          <td className="p-2 text-center font-semibold">{p.currentStock} {p.unitName}</td>
                          <td className="p-2 text-left">{formatCurrency(p.stockValue)}</td>
                          <td className="p-2">
                            {p.isLowStock ? <Badge variant="destructive">ناقص</Badge> : <Badge variant="outline">طبيعي</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="best">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-right">
                <th className="p-3">#</th>
                <th className="p-3">المنتج</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3 text-left">الكمية المباعة</th>
                <th className="p-3 text-left">الإيراد</th>
              </tr></thead>
              <tbody>
                {best.map((p: any, i: number) => (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground font-bold">{i + 1}</td>
                    <td className="p-3 font-medium">{p.nameAr}</td>
                    <td className="p-3 text-muted-foreground">{p.categoryName || "—"}</td>
                    <td className="p-3 text-left font-semibold">{p.totalQty}</td>
                    <td className="p-3 text-left text-primary font-semibold">{formatCurrency(p.totalRevenue)}</td>
                  </tr>
                ))}
                {best.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="commission">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr className="text-right">
                <th className="p-3">الصنايعي</th>
                <th className="p-3">التخصص</th>
                <th className="p-3 text-center">الفواتير</th>
                <th className="p-3 text-left">إجمالي المبيعات</th>
                <th className="p-3 text-left">العمولة</th>
                <th className="p-3 text-center">%</th>
              </tr></thead>
              <tbody>
                {commissions.map((c: any) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.jobType || "—"}</td>
                    <td className="p-3 text-center">{c.invoiceCount}</td>
                    <td className="p-3 text-left">{formatCurrency(c.totalSales)}</td>
                    <td className="p-3 text-left text-amber-600 font-bold">{formatCurrency(c.totalCommission)}</td>
                    <td className="p-3 text-center text-muted-foreground">{c.commissionPercent || 0}%</td>
                  </tr>
                ))}
                {commissions.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد بيانات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4">
              <p className="text-2xl font-bold">{formatCurrency(purchases?.summary?.totalPurchases)}</p>
              <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(purchases?.summary?.totalPaid)}</p>
              <p className="text-xs text-muted-foreground">المدفوع</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <p className="text-2xl font-bold text-destructive">{formatCurrency(purchases?.summary?.totalRemaining)}</p>
              <p className="text-xs text-muted-foreground">المتبقي</p>
            </CardContent></Card>
          </div>
          {purchases?.bySupplier?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>المشتريات حسب المورد</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="p-2 text-right">المورد</th>
                    <th className="p-2 text-left">الإجمالي</th>
                  </tr></thead>
                  <tbody>
                    {purchases.bySupplier.map((s: any) => (
                      <tr key={s.supplier} className="border-b">
                        <td className="p-2 font-medium">{s.supplier}</td>
                        <td className="p-2 text-left font-semibold">{formatCurrency(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
