import { useState } from "react";
import {
  useListQuotations,
  useCreateQuotation,
  useGetQuotation,
  useConvertQuotationToInvoice,
  useDuplicateQuotation,
  useListCustomers,
  useListCraftsmen,
  useSearchProducts,
  getListQuotationsQueryKey,
  getGetQuotationQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, FileText, ArrowRight, Copy, Trash2, Minus } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكدة", variant: "outline" },
  converted: { label: "محولة", variant: "default" },
  cancelled: { label: "ملغية", variant: "destructive" },
};

interface CartItem { productId: number; productName: string; quantity: number; unitPrice: number; discount: number; total: number; }

function NewQuotationDialog({ onClose }: { onClose: () => void }) {
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [craftsmanId, setCraftsmanId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const qc = useQueryClient();
  const { data: searchResults } = useSearchProducts({ q: productSearch }, { query: { enabled: productSearch.length >= 1 } });
  const { data: customers } = useListCustomers({});
  const { data: craftsmen } = useListCraftsmen({});
  const createQuotation = useCreateQuotation();

  const addToCart = (p: any) => {
    setCart(prev => {
      const ex = prev.find(i => i.productId === p.id);
      if (ex) return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice - i.discount } : i);
      return [...prev, { productId: p.id, productName: p.nameAr, quantity: 1, unitPrice: p.sellingPrice, discount: 0, total: p.sellingPrice }];
    });
    setProductSearch("");
  };

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal - discount;

  const handleSave = async () => {
    if (cart.length === 0) { toast.error("أضف منتجاً"); return; }
    await createQuotation.mutateAsync({
      data: {
        customerId: customerId ? Number(customerId) : undefined,
        craftsmanId: craftsmanId ? Number(craftsmanId) : undefined,
        discount, validUntil: validUntil || undefined, status: "confirmed",
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount })),
      },
    });
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    toast.success("تم حفظ التسعيرة");
    onClose();
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>تسعيرة جديدة</DialogTitle></DialogHeader>
      <div className="flex gap-2">
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="اختر العميل (اختياري)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">بدون عميل</SelectItem>
            {(customers as any)?.items?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={craftsmanId} onValueChange={setCraftsmanId}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="الصنايعي (اختياري)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">بدون صنايعي</SelectItem>
            {(craftsmen as any)?.items?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-36" value={validUntil} onChange={e => setValidUntil(e.target.value)} title="صالحة حتى" />
      </div>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="ابحث عن منتج..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
      </div>
      {productSearch && (
        <div className="border rounded-lg overflow-hidden">
          {(searchResults as any[])?.map((p: any) => (
            <div key={p.id} className="flex justify-between p-2 hover:bg-muted cursor-pointer border-b" onClick={() => addToCart(p)}>
              <span>{p.nameAr} <span className="text-xs text-muted-foreground">({p.sku})</span></span>
              <span className="font-semibold">{formatCurrency(p.sellingPrice)}</span>
            </div>
          ))}
          {!(searchResults as any[])?.length && <div className="p-3 text-center text-muted-foreground">لا توجد نتائج</div>}
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr>
          <th className="p-2 text-right">المنتج</th>
          <th className="p-2 text-center w-24">الكمية</th>
          <th className="p-2 text-left w-28">السعر</th>
          <th className="p-2 text-left w-24">الإجمالي</th>
          <th className="p-2 w-8"></th>
        </tr></thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-2">{item.productName}</td>
              <td className="p-2">
                <div className="flex items-center justify-center gap-1">
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => ix !== idx ? i : { ...i, quantity: Math.max(1, i.quantity - 1), total: Math.max(1, i.quantity - 1) * i.unitPrice }))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => ix !== idx ? i : { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unitPrice }))}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </td>
              <td className="p-2 text-left">{formatCurrency(item.unitPrice)}</td>
              <td className="p-2 text-left font-semibold">{formatCurrency(item.total)}</td>
              <td className="p-2"><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 text-sm">
          <span>خصم:</span>
          <Input type="number" className="w-24 h-7" value={discount || ""} onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
        </div>
        <div className="text-left">
          <p className="text-sm text-muted-foreground">فرعي: {formatCurrency(subtotal)}</p>
          <p className="font-bold text-lg">الإجمالي: {formatCurrency(total)}</p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleSave} disabled={createQuotation.isPending}>حفظ التسعيرة</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function QuotationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();
  const params = { search: search || undefined, status: statusFilter || undefined, limit: 100 };
  const { data, isLoading } = useListQuotations(params, { query: { queryKey: getListQuotationsQueryKey(params) } });
  const convertToInvoice = useConvertQuotationToInvoice();
  const duplicate = useDuplicateQuotation();

  const handleConvert = async (id: number) => {
    await convertToInvoice.mutateAsync({ id, data: { paymentType: "cash" } });
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    toast.success("تم تحويل التسعيرة إلى فاتورة");
  };

  const handleDuplicate = async (id: number) => {
    await duplicate.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    toast.success("تم نسخ التسعيرة");
  };

  const quotations = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <NewQuotationDialog onClose={() => setShowAdd(false)} />
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">التسعيرات</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 ml-2" />
          تسعيرة جديدة
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="رقم التسعيرة أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-3">الرقم</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الحالة</th>
                <th className="p-3 text-left">الإجمالي</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                quotations.map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-medium text-primary">{q.serial}</td>
                    <td className="p-3 text-muted-foreground">{new Date(q.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3">{q.customerName || <span className="text-muted-foreground">غير محدد</span>}</td>
                    <td className="p-3"><Badge variant={STATUS_LABELS[q.status]?.variant}>{STATUS_LABELS[q.status]?.label}</Badge></td>
                    <td className="p-3 text-left font-semibold">{formatCurrency(q.total)}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {q.status !== "converted" && q.status !== "cancelled" && (
                          <Button variant="outline" size="sm" onClick={() => handleConvert(q.id)} disabled={convertToInvoice.isPending}>
                            <ArrowRight className="h-3 w-3 ml-1" /> تحويل
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicate(q.id)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              }
              {!isLoading && quotations.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  لا توجد تسعيرات
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
