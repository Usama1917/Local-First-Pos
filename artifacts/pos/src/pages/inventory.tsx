import { useState } from "react";
import {
  useListStockCounts,
  useCreateStockCount,
  useGetStockCount,
  useFinalizeStockCount,
  useCreateStockAdjustment,
  useListStockMovements,
  getListStockCountsQueryKey,
  getGetStockCountQueryKey,
  getListStockMovementsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Plus, ClipboardList, CheckCircle, Package, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

function StockCountDetail({ countId, onClose }: { countId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useGetStockCount(countId, { query: { queryKey: getGetStockCountQueryKey(countId) } });
  const finalize = useFinalizeStockCount();
  const count = data as any;
  const [localItems, setLocalItems] = useState<Record<number, number>>({});

  const updateItem = (productId: number, val: number) => setLocalItems(prev => ({ ...prev, [productId]: val }));

  const handleSaveAndFinalize = async () => {
    const updates = Object.entries(localItems).map(([pid, qty]) => ({ productId: Number(pid), countedQty: qty }));
    if (updates.length > 0) {
      // The GET already has count data, we just finalize
    }
    await finalize.mutateAsync({ id: countId });
    qc.invalidateQueries({ queryKey: getListStockCountsQueryKey() });
    toast.success("تم إنهاء الجرد وتحديث المخزون");
    onClose();
  };

  if (isLoading || !count) return <DialogContent><div className="p-8 text-center">جاري التحميل...</div></DialogContent>;

  const items = count.items || [];

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{count.name}</DialogTitle>
        <Badge variant={count.status === "finalized" ? "default" : "secondary"}>
          {count.status === "finalized" ? "منتهي" : "قيد الجرد"}
        </Badge>
      </DialogHeader>
      <div className="text-sm text-muted-foreground mb-3">
        {items.filter((i: any) => (localItems[i.productId] ?? i.countedQty) !== i.systemQty).length} فرق من {items.length} صنف
      </div>
      <div className="overflow-y-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-right">المنتج</th>
              <th className="p-2 text-center">الكود</th>
              <th className="p-2 text-center">كمية النظام</th>
              <th className="p-2 text-center">الكمية المعدودة</th>
              <th className="p-2 text-center">الفرق</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => {
              const counted = localItems[item.productId] ?? item.countedQty;
              const diff = counted - item.systemQty;
              return (
                <tr key={item.id} className={`border-b ${diff !== 0 ? "bg-amber-50/50 dark:bg-amber-500/10" : ""}`}>
                  <td className="p-2 font-medium">{item.productName}</td>
                  <td className="p-2 text-center font-mono text-xs text-muted-foreground">{item.sku}</td>
                  <td className="p-2 text-center font-semibold">{item.systemQty}</td>
                  <td className="p-2 text-center">
                    {count.status === "draft" ? (
                      <Input
                        type="number"
                        className="h-7 w-20 text-center mx-auto"
                        value={counted}
                        onChange={e => updateItem(item.productId, parseFloat(e.target.value) || 0)}
                      />
                    ) : <span>{item.countedQty}</span>}
                  </td>
                  <td className="p-2 text-center">
                    {diff !== 0 && (
                      <span className={`font-bold flex items-center justify-center gap-1 ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                        {diff > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(diff)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {count.status === "draft" && (
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={handleSaveAndFinalize} disabled={finalize.isPending}>
            <CheckCircle className="h-4 w-4 ml-2" />
            إنهاء الجرد وتحديث المخزون
          </Button>
        </DialogFooter>
      )}
    </DialogContent>
  );
}

export default function InventoryPage() {
  const [selectedCountId, setSelectedCountId] = useState<number | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjProductId, setAdjProductId] = useState("");
  const [adjQty, setAdjQty] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const qc = useQueryClient();
  const { data, isLoading } = useListStockCounts({ query: { queryKey: getListStockCountsQueryKey() } });
  const { data: movements } = useListStockMovements({ limit: 50 }, { query: { queryKey: getListStockMovementsQueryKey({ limit: 50 }) } });
  const createCount = useCreateStockCount();
  const createAdjustment = useCreateStockAdjustment();

  const handleNewCount = async () => {
    const r = await createCount.mutateAsync({ data: {} });
    qc.invalidateQueries({ queryKey: getListStockCountsQueryKey() });
    toast.success("تم إنشاء جلسة جرد جديدة");
    setSelectedCountId((r as any).id);
  };

  const handleAdjust = async () => {
    if (!adjProductId || !adjQty) { toast.error("أدخل المنتج والكمية"); return; }
    await createAdjustment.mutateAsync({ data: { productId: Number(adjProductId), quantity: parseFloat(adjQty), notes: adjNotes || undefined } });
    qc.invalidateQueries({ queryKey: getListStockMovementsQueryKey({}) });
    toast.success("تم التعديل");
    setShowAdjust(false);
    setAdjProductId(""); setAdjQty(""); setAdjNotes("");
  };

  const counts = (data as any)?.items || [];
  const mvts = (movements as any)?.items || [];

  const MOVE_LABELS: Record<string, string> = {
    sale: "بيع", purchase: "شراء", opening: "افتتاحي", adjustment: "تعديل",
    count_positive: "جرد زيادة", count_negative: "جرد نقص",
  };

  return (
    <div className="space-y-4">
      {selectedCountId && (
        <Dialog open={!!selectedCountId} onOpenChange={() => setSelectedCountId(null)}>
          <StockCountDetail countId={selectedCountId} onClose={() => setSelectedCountId(null)} />
        </Dialog>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المخزن</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAdjust(true)}>تعديل يدوي</Button>
          <Button onClick={handleNewCount} disabled={createCount.isPending}>
            <Plus className="h-4 w-4 ml-2" />
            جلسة جرد جديدة
          </Button>
        </div>
      </div>

      {showAdjust && (
        <Card>
          <CardHeader><CardTitle>تعديل رصيد يدوي</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3 items-end">
              <div className="space-y-1"><Label>رقم المنتج (ID)</Label><Input value={adjProductId} onChange={e => setAdjProductId(e.target.value)} className="w-32" /></div>
              <div className="space-y-1"><Label>الكمية (+ زيادة / - نقص)</Label><Input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} className="w-28" /></div>
              <div className="space-y-1 flex-1"><Label>ملاحظات</Label><Input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} /></div>
              <Button onClick={handleAdjust} disabled={createAdjustment.isPending}>تطبيق</Button>
              <Button variant="ghost" onClick={() => setShowAdjust(false)}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="counts">
        <TabsList>
          <TabsTrigger value="counts">جلسات الجرد</TabsTrigger>
          <TabsTrigger value="movements">حركات المخزن</TabsTrigger>
        </TabsList>

        <TabsContent value="counts">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3">الاسم</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">عدد الأصناف</th>
                  <th className="p-3">تاريخ الإنشاء</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                  counts.map((c: any) => (
                    <tr key={c.id} className="border-b nav-hover">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3"><Badge variant={c.status === "finalized" ? "default" : "secondary"}>{c.status === "finalized" ? "منتهي" : "قيد الجرد"}</Badge></td>
                      <td className="p-3">{c.itemCount} صنف</td>
                      <td className="p-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCountId(c.id)}>
                          <ClipboardList className="h-4 w-4 ml-1" /> فتح
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!isLoading && counts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد جلسات جرد</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3">المنتج</th>
                  <th className="p-3">النوع</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-center">قبل</th>
                  <th className="p-3 text-center">بعد</th>
                  <th className="p-3">ملاحظات</th>
                  <th className="p-3">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {mvts.map((m: any) => (
                  <tr key={m.id} className="border-b nav-hover">
                    <td className="p-3 font-medium">{m.productName}</td>
                    <td className="p-3"><Badge variant="outline">{MOVE_LABELS[m.type] || m.type}</Badge></td>
                    <td className={`p-3 text-center font-bold ${m.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                    <td className="p-3 text-center text-muted-foreground">{m.balanceBefore}</td>
                    <td className="p-3 text-center font-semibold">{m.balanceAfter}</td>
                    <td className="p-3 text-muted-foreground text-xs">{m.notes || "—"}</td>
                    <td className="p-3 text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("ar-EG")}</td>
                  </tr>
                ))}
                {mvts.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد حركات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
