import { useState } from "react";
import {
  useListCraftsmen,
  useCreateCraftsman,
  useGetCraftsman,
  useGetCraftsmanCustomers,
  getListCraftsmenQueryKey,
  getGetCraftsmanQueryKey,
  getGetCraftsmanCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, HardHat, Eye, Users, Receipt, FileText } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  finalized: { label: "مكتملة", variant: "default" },
  partially_paid: { label: "جزئي", variant: "outline" },
  paid: { label: "مدفوعة", variant: "default" },
  credit: { label: "آجل", variant: "destructive" },
  cancelled: { label: "ملغية", variant: "secondary" },
};
const Q_STATUS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكدة", variant: "outline" },
  converted: { label: "محولة", variant: "default" },
  cancelled: { label: "ملغية", variant: "destructive" },
};

function CraftsmanProfile({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useGetCraftsman(id, { query: { queryKey: getGetCraftsmanQueryKey(id) } });
  const { data: linkedCustomers } = useGetCraftsmanCustomers(id, { query: { queryKey: getGetCraftsmanCustomersQueryKey(id) } });

  const craftsman = data as any;
  if (!craftsman) return null;

  const invoices = craftsman.recentSales || [];
  const quotations = craftsman.recentQuotations || [];
  const customers = (linkedCustomers as any)?.items || [];

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <HardHat className="h-5 w-5 text-amber-600" />
          {craftsman.name}
        </DialogTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          {craftsman.phone && <span>📞 {craftsman.phone}</span>}
          {craftsman.jobType && <span>🔧 {craftsman.jobType}</span>}
        </div>
      </DialogHeader>

      <div className="grid grid-cols-4 gap-3 mb-2">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold">{formatCurrency(craftsman.totalSales)}</p>
          <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{formatCurrency(craftsman.totalCommission)}</p>
          <p className="text-xs text-muted-foreground">إجمالي العمولة</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold">{craftsman.commissionPercent || 0}%</p>
          <p className="text-xs text-muted-foreground">نسبة العمولة</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-primary">{craftsman.uniqueCustomers || 0}</p>
          <p className="text-xs text-muted-foreground">عدد العملاء</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList className="w-full">
          <TabsTrigger value="invoices" className="flex-1">
            <Receipt className="h-3.5 w-3.5 ml-1" />
            الفواتير ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="quotations" className="flex-1">
            <FileText className="h-3.5 w-3.5 ml-1" />
            التسعيرات ({quotations.length})
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex-1">
            <Users className="h-3.5 w-3.5 ml-1" />
            العملاء ({customers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد فواتير لهذا الصنايعي</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">الفاتورة</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-left">الإجمالي</th>
                  <th className="p-2 text-left">المتبقي</th>
                  <th className="p-2 text-left">العمولة</th>
                  <th className="p-2 text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-mono font-medium text-primary">{inv.serial}</td>
                    <td className="p-2">{inv.customerName || <span className="text-muted-foreground">نقدي</span>}</td>
                    <td className="p-2">
                      <Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge>
                    </td>
                    <td className="p-2 text-left font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="p-2 text-left">
                      {inv.remainingAmount > 0
                        ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span>
                        : <span className="text-emerald-600 text-xs">مسدد</span>}
                    </td>
                    <td className="p-2 text-left text-amber-600">{inv.craftsmanCommission ? formatCurrency(inv.craftsmanCommission) : "—"}</td>
                    <td className="p-2 text-muted-foreground text-xs">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="quotations">
          {quotations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد تسعيرات لهذا الصنايعي</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">التسعيرة</th>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-left">الإجمالي</th>
                  <th className="p-2 text-right">تحولت إلى</th>
                  <th className="p-2 text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-mono font-medium text-primary">{q.serial}</td>
                    <td className="p-2">{q.customerName || <span className="text-muted-foreground">غير محدد</span>}</td>
                    <td className="p-2">
                      <Badge variant={Q_STATUS[q.status]?.variant}>{Q_STATUS[q.status]?.label}</Badge>
                    </td>
                    <td className="p-2 text-left font-semibold">{formatCurrency(q.total)}</td>
                    <td className="p-2 text-xs font-mono text-muted-foreground">{q.convertedInvoiceSerial || "—"}</td>
                    <td className="p-2 text-muted-foreground text-xs">{new Date(q.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="customers">
          <div className="mb-3 text-sm text-muted-foreground">
            العملاء الذين تعاملوا عن طريق هذا الصنايعي
          </div>
          {customers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا يوجد عملاء مرتبطين بهذا الصنايعي</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">العميل</th>
                  <th className="p-2 text-right">الهاتف</th>
                  <th className="p-2 text-right">المنطقة</th>
                  <th className="p-2 text-center">الفواتير</th>
                  <th className="p-2 text-left">إجمالي المبيعات</th>
                  <th className="p-2 text-left">المتبقي</th>
                  <th className="p-2 text-right">آخر تعامل</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c: any) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="p-2 text-muted-foreground">{c.area || "—"}</td>
                    <td className="p-2 text-center">
                      <Badge variant="outline">{c.invoiceCount}</Badge>
                    </td>
                    <td className="p-2 text-left font-semibold">{formatCurrency(c.totalSales)}</td>
                    <td className="p-2 text-left">
                      {c.totalRemaining > 0
                        ? <span className="text-destructive font-semibold">{formatCurrency(c.totalRemaining)}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="p-2 text-muted-foreground text-xs">
                      {c.lastInvoiceDate ? new Date(c.lastInvoiceDate).toLocaleDateString("ar-EG") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function CraftsmenPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", jobType: "", address: "", commissionPercent: "5", notes: "" });
  const qc = useQueryClient();
  const params = { search: search || undefined };
  const { data, isLoading } = useListCraftsmen(params, { query: { queryKey: getListCraftsmenQueryKey(params) } });
  const createCraftsman = useCreateCraftsman();

  const handleAdd = async () => {
    if (!form.name) { toast.error("الاسم مطلوب"); return; }
    await createCraftsman.mutateAsync({ data: { ...form, commissionPercent: parseFloat(form.commissionPercent) || undefined } });
    qc.invalidateQueries({ queryKey: getListCraftsmenQueryKey({}) });
    toast.success("تم الإضافة");
    setShowAdd(false);
  };

  const craftsmen = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      {selectedId && (
        <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
          <CraftsmanProfile id={selectedId} onClose={() => setSelectedId(null)} />
        </Dialog>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة صنايعي</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>هاتف</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>التخصص</Label><Input placeholder="سباك، نقاش..." value={form.jobType} onChange={e => setForm(f => ({ ...f, jobType: e.target.value }))} /></div>
            <div className="space-y-1"><Label>نسبة العمولة %</Label><Input type="number" value={form.commissionPercent} onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={createCraftsman.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الصنايعية</h1>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 ml-2" />إضافة صنايعي</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الاسم</th>
              <th className="p-3">التخصص</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3 text-left">إجمالي المبيعات</th>
              <th className="p-3 text-left">العمولة</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              craftsmen.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground">{c.jobType || "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="p-3 text-left">{formatCurrency(c.totalSales)}</td>
                  <td className="p-3 text-left text-amber-600 font-semibold">{formatCurrency(c.totalCommission)}</td>
                  <td className="p-3"><Button variant="ghost" size="sm" onClick={() => setSelectedId(c.id)}><Eye className="h-4 w-4 ml-1" />عرض</Button></td>
                </tr>
              ))}
            {!isLoading && craftsmen.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                <HardHat className="h-10 w-10 mx-auto mb-2 opacity-30" />لا يوجد صنايعية
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
