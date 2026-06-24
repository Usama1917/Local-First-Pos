import { useState } from "react";
import {
  useListPurchaseInvoices,
  useCreatePurchaseInvoice,
  useFinalizePurchaseInvoice,
  useListSuppliers,
  useListProducts,
  useSearchProducts,
  getListPurchaseInvoicesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, ShoppingBag, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  finalized: { label: "مكتملة", variant: "default" },
  partially_paid: { label: "مدفوع جزئي", variant: "outline" },
  paid: { label: "مدفوعة", variant: "default" },
  credit: { label: "آجل", variant: "destructive" },
  cancelled: { label: "ملغية", variant: "secondary" },
};

interface PurchaseItem {
  productId: number; productName: string; quantity: number;
  listPrice: number; supplierDiscount: number; netPrice: number; extraCost: number; trueCost: number; total: number;
}

function NewPurchaseDialog({ onClose }: { onClose: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const qc = useQueryClient();
  const { data: suppliers } = useListSuppliers({});
  const { data: searchResults } = useSearchProducts({ q: productSearch }, { query: { enabled: productSearch.length >= 1 } });
  const createPurchase = useCreatePurchaseInvoice();
  const finalizePurchase = useFinalizePurchaseInvoice();

  const addProduct = (p: any) => {
    setItems(prev => {
      if (prev.find(i => i.productId === p.id)) return prev;
      const disc = p.supplierDiscount || 30;
      const net = p.listPrice * (1 - disc / 100);
      const extra = p.extraCost || 0;
      const trueCost = net + extra;
      return [...prev, {
        productId: p.id, productName: p.nameAr, quantity: 1,
        listPrice: p.listPrice || 0, supplierDiscount: disc, netPrice: net, extraCost: extra, trueCost, total: trueCost,
      }];
    });
    setProductSearch("");
  };

  const updateItem = (idx: number, key: keyof PurchaseItem, val: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [key]: val };
      const net = updated.listPrice * (1 - updated.supplierDiscount / 100);
      updated.netPrice = net;
      updated.trueCost = net + updated.extraCost;
      updated.total = updated.trueCost * updated.quantity;
      return updated;
    }));
  };

  const total = items.reduce((s, i) => s + i.total, 0);

  const handleSave = async (finalize = false) => {
    if (items.length === 0) { toast.error("أضف منتجاً"); return; }
    try {
      const fp = paymentType === "cash" ? total : parseFloat(paidAmount) || 0;
      const inv = await createPurchase.mutateAsync({
        data: {
          supplierId: supplierId ? Number(supplierId) : undefined,
          paymentType: paymentType as any, paidAmount: fp, notes: notes || undefined,
          invoiceDate, status: "draft",
          items: items.map(i => ({ productId: i.productId, quantity: i.quantity, listPrice: i.listPrice, supplierDiscount: i.supplierDiscount, netPrice: i.netPrice, extraCost: i.extraCost, trueCost: i.trueCost, total: i.total })),
        },
      });
      if (finalize) {
        await finalizePurchase.mutateAsync({ id: (inv as any).id, data: { paymentType: paymentType as any, paidAmount: fp } });
        toast.success("تم حفظ وإنهاء فاتورة المشتريات");
      } else {
        toast.success("تم حفظ الفاتورة كمسودة");
      }
      qc.invalidateQueries({ queryKey: getListPurchaseInvoicesQueryKey({}) });
      onClose();
    } catch (e: any) { toast.error(e.message || "خطأ"); }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>فاتورة مشتريات جديدة</DialogTitle></DialogHeader>
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>المورد</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
            <SelectContent>{(suppliers as any)?.items?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
        <div className="space-y-1">
          <Label>الدفع</Label>
          <Select value={paymentType} onValueChange={setPaymentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="credit">آجل</SelectItem>
              <SelectItem value="partial">جزئي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentType === "partial" && (
          <div className="col-span-2 space-y-1"><Label>المدفوع</Label><Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} /></div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="ابحث عن منتج للإضافة..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
      </div>
      {productSearch && (searchResults as any[])?.map((p: any) => (
        <div key={p.id} className="flex justify-between p-2 border rounded hover:bg-muted cursor-pointer" onClick={() => addProduct(p)}>
          <span>{p.nameAr} <span className="text-xs text-muted-foreground">({p.sku})</span></span>
          <span className="text-sm text-muted-foreground">قائمة: {formatCurrency(p.listPrice)}</span>
        </div>
      ))}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-right">المنتج</th>
              <th className="p-2 text-center w-16">الكمية</th>
              <th className="p-2 text-left w-24">سعر القائمة</th>
              <th className="p-2 text-left w-20">خصم %</th>
              <th className="p-2 text-left w-24">صافي شراء</th>
              <th className="p-2 text-left w-20">تكاليف</th>
              <th className="p-2 text-left w-24">التكلفة</th>
              <th className="p-2 text-left w-24">الإجمالي</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 font-medium">{item.productName}</td>
                <td className="p-2"><Input type="number" className="h-7 text-xs text-center w-14" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseFloat(e.target.value) || 1)} /></td>
                <td className="p-2"><Input type="number" className="h-7 text-xs w-20" value={item.listPrice} onChange={e => updateItem(idx, "listPrice", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2"><Input type="number" className="h-7 text-xs w-16" value={item.supplierDiscount} onChange={e => updateItem(idx, "supplierDiscount", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2 text-left text-muted-foreground">{formatCurrency(item.netPrice)}</td>
                <td className="p-2"><Input type="number" className="h-7 text-xs w-16" value={item.extraCost} onChange={e => updateItem(idx, "extraCost", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2 text-left font-medium">{formatCurrency(item.trueCost)}</td>
                <td className="p-2 text-left font-bold">{formatCurrency(item.total)}</td>
                <td className="p-2"><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {items.length > 0 && (
        <div className="flex justify-between items-center bg-muted/30 p-3 rounded">
          <span className="text-muted-foreground">عدد الأصناف: {items.length}</span>
          <div className="font-bold text-lg">الإجمالي: <span className="text-primary">{formatCurrency(total)}</span></div>
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button variant="outline" onClick={() => handleSave(false)} disabled={createPurchase.isPending}>حفظ مسودة</Button>
        <Button onClick={() => handleSave(true)} disabled={createPurchase.isPending || finalizePurchase.isPending}>
          <CheckCircle className="h-4 w-4 ml-2" />
          إنهاء الفاتورة
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function PurchasesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const params = { search: search || undefined, status: statusFilter || undefined, limit: 100 };
  const { data, isLoading } = useListPurchaseInvoices(params, { query: { queryKey: getListPurchaseInvoicesQueryKey(params) } });
  const invoices = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <NewPurchaseDialog onClose={() => setShowAdd(false)} />
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المشتريات</h1>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 ml-2" />فاتورة مشتريات</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="رقم الفاتورة أو المورد..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">كل الحالات</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الرقم</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3">المورد</th>
              <th className="p-3">الحالة</th>
              <th className="p-3 text-left">الإجمالي</th>
              <th className="p-3 text-left">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              invoices.map((inv: any) => (
                <tr key={inv.id} className="border-b hover:bg-muted/30">
                  <td className="p-3 font-mono font-medium text-primary">{inv.serial}</td>
                  <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3">{inv.supplierName || "—"}</td>
                  <td className="p-3"><Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge></td>
                  <td className="p-3 text-left font-semibold">{formatCurrency(inv.total)}</td>
                  <td className="p-3 text-left">{inv.remainingAmount > 0 ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span> : <span className="text-emerald-600">مسدد</span>}</td>
                </tr>
              ))}
            {!isLoading && invoices.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-30" />لا توجد فواتير مشتريات
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
