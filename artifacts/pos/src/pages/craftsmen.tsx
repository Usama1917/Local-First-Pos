import { useState } from "react";
import {
  useListCraftsmen,
  useCreateCraftsman,
  useGetCraftsman,
  getListCraftsmenQueryKey,
  getGetCraftsmanQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, HardHat, Eye } from "lucide-react";
import { toast } from "sonner";

function CraftsmanProfile({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useGetCraftsman(id, { query: { queryKey: getGetCraftsmanQueryKey(id) } });
  const craftsman = data as any;
  if (!craftsman) return null;
  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{craftsman.name}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-3 gap-3 mb-4">
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
      </div>
      <div className="text-sm text-muted-foreground mb-3 space-x-4 space-x-reverse">
        {craftsman.phone && <span>هاتف: {craftsman.phone}</span>}
        {craftsman.jobType && <span>التخصص: {craftsman.jobType}</span>}
      </div>
      <h3 className="font-semibold mb-2">آخر الفواتير</h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr>
          <th className="p-2 text-right">الفاتورة</th>
          <th className="p-2 text-right">العميل</th>
          <th className="p-2 text-left">الإجمالي</th>
          <th className="p-2 text-left">العمولة</th>
          <th className="p-2 text-right">التاريخ</th>
        </tr></thead>
        <tbody>
          {craftsman.recentSales?.map((inv: any) => (
            <tr key={inv.id} className="border-b">
              <td className="p-2 font-mono">{inv.serial}</td>
              <td className="p-2">{inv.customerName || "—"}</td>
              <td className="p-2 text-left">{formatCurrency(inv.total)}</td>
              <td className="p-2 text-left text-amber-600">{formatCurrency(inv.craftsmanCommission)}</td>
              <td className="p-2 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
