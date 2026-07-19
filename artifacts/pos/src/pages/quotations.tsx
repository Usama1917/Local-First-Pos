import { useState } from "react";
import {
  useListQuotations,
  useCreateQuotation,
  useGetQuotation,
  useConvertQuotationToInvoice,
  useDuplicateQuotation,
  useDeleteQuotation,
  useListCustomers,
  useListCraftsmen,
  useSearchProducts,
  getSearchProductsQueryKey,
  getListQuotationsQueryKey,
  getGetQuotationQueryKey,
  getListCraftsmenQueryKey,
} from "@workspace/api-client-react";
import { DeleteButton } from "@/components/ui/delete-confirm";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AuditInfo } from "@/components/ui/audit-info";
import { formatCurrency } from "@/lib/format";
import { useBarcodeScanner, findProductByCode } from "@/hooks/use-barcode-scanner";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { Search, Plus, FileText, ArrowRight, Copy, Trash2, Minus, HardHat } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكدة", variant: "outline" },
  converted: { label: "محولة", variant: "default" },
  cancelled: { label: "ملغية", variant: "destructive" },
};

interface CartItem { productId: number; productName: string; quantity: number; unitPrice: number; discountPercent: number; total: number; }

/** Per-item discount as a % of the line (qty × price). A NEGATIVE % is a surcharge (addition). */
const discountAmount = (qty: number, unitPrice: number, discountPercent: number) => qty * unitPrice * ((discountPercent || 0) / 100);
/** Line total after the per-item %: qty × price − discountAmount (a negative % increases it). */
const lineTotal = (qty: number, unitPrice: number, discountPercent: number) => qty * unitPrice - discountAmount(qty, unitPrice, discountPercent);

function NewQuotationDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [craftsmanId, setCraftsmanId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const qc = useQueryClient();
  const { data: searchResults } = useSearchProducts({ q: productSearch }, { query: { enabled: productSearch.length >= 1, queryKey: getSearchProductsQueryKey({ q: productSearch }) } });
  const { data: customers } = useListCustomers({ isActive: true });
  const { data: craftsmen } = useListCraftsmen({ isActive: true });
  const createQuotation = useCreateQuotation();

  const addToCart = (p: any) => {
    setCart(prev => {
      const ex = prev.find(i => i.productId === p.id);
      if (ex) return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1, total: lineTotal(i.quantity + 1, i.unitPrice, i.discountPercent) } : i);
      return [...prev, { productId: p.id, productName: p.nameAr, quantity: 1, unitPrice: p.sellingPrice, discountPercent: 0, total: lineTotal(1, p.sellingPrice, 0) }];
    });
    setProductSearch("");
  };

  // Hardware laser scanner: scan a product → adds it to the quotation.
  useBarcodeScanner(
    async (code) => {
      const p = await findProductByCode(code);
      if (p) addToCart(p);
      else toast.error(`منتج غير موجود بالباركود: ${code}`);
    },
    { enabled: open },
  );

  const [restored, setRestored] = useState(false);
  const resetForm = () => {
    setCart([]); setCustomerId(""); setCraftsmanId(""); setDiscount(0); setValidUntil(""); setRestored(false);
  };
  // Periodic auto-save → a power cut / refresh mid-quotation won't lose the work.
  const { clearDraft } = useDraftAutosave({
    type: "quotation",
    entityId: "new",
    enabled: open,
    hasContent: cart.length > 0,
    data: { cart, customerId, craftsmanId, discount, validUntil },
    onRestore: (p) => {
      if (!p?.cart?.length) return;
      setCart(p.cart);
      setCustomerId(p.customerId || "");
      setCraftsmanId(p.craftsmanId || "");
      setDiscount(p.discount || 0);
      setValidUntil(p.validUntil || "");
      setRestored(true);
    },
  });

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal - discount;

  const handleSave = async () => {
    if (cart.length === 0) { toast.error("أضف منتجاً"); return; }
    await createQuotation.mutateAsync({
      data: {
        customerId: customerId ? Number(customerId) : undefined,
        craftsmanId: craftsmanId ? Number(craftsmanId) : undefined,
        discount, validUntil: validUntil || undefined, status: "confirmed",
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: discountAmount(i.quantity, i.unitPrice, i.discountPercent) })),
      },
    });
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    toast.success("تم حفظ التسعيرة");
    clearDraft();
    resetForm();
    onClose();
  };

  return (
    <DialogContent className="max-w-[1340px] w-[96vw] max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>تسعيرة جديدة</DialogTitle></DialogHeader>
      {restored && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>↩️ تم استرجاع مسودة محفوظة تلقائيًا</span>
          <Button variant="ghost" size="sm" className="h-6 text-amber-800 dark:text-amber-200" onClick={() => { resetForm(); clearDraft(); }}>ابدأ من جديد</Button>
        </div>
      )}
      <div className="flex gap-2">
        <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="اختر العميل (اختياري)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">بدون عميل</SelectItem>
            {(customers as any)?.items?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={craftsmanId || "__none__"} onValueChange={(v) => setCraftsmanId(v === "__none__" ? "" : v)}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="الصنايعي (اختياري)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">بدون صنايعي</SelectItem>
            {(craftsmen as any)?.items?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.jobType ? `(${c.jobType})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-36" value={validUntil} onChange={e => setValidUntil(e.target.value)} title="صالحة حتى" />
      </div>
      {(customerId || craftsmanId) && (
        <div className="flex gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
          {customerId && <span>✓ العميل: {(customers as any)?.items?.find((c: any) => String(c.id) === customerId)?.name}</span>}
          {craftsmanId && <span>✓ الصنايعي: {(craftsmen as any)?.items?.find((c: any) => String(c.id) === craftsmanId)?.name}</span>}
        </div>
      )}
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
      <table className="w-full text-sm table-fixed">
        <thead className="bg-muted/50"><tr>
          <th className="p-2 text-right w-[30%]">المنتج</th>
          <th className="p-2 text-center w-[18%]">الكمية</th>
          <th className="p-2 text-left w-[16%]">السعر</th>
          <th className="p-2 text-left w-[16%]">الخصم %</th>
          <th className="p-2 text-left w-[15%]">الإجمالي</th>
          <th className="p-2 w-[5%]"></th>
        </tr></thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx} className="border-b">
              <td className="p-2 truncate" title={item.productName}>{item.productName}</td>
              <td className="p-2">
                <div className="flex items-center justify-center gap-1">
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => { if (ix !== idx) return i; const q = Math.max(1, i.quantity - 1); return { ...i, quantity: q, total: lineTotal(q, i.unitPrice, i.discountPercent) }; }))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => { if (ix !== idx) return i; const q = i.quantity + 1; return { ...i, quantity: q, total: lineTotal(q, i.unitPrice, i.discountPercent) }; }))}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </td>
              <td className="p-2 text-left">{formatCurrency(item.unitPrice)}</td>
              <td className="p-2">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="h-7 text-left"
                    placeholder="0"
                    title="نسبة خصم % — قيمة سالبة تعني إضافة على السعر"
                    value={item.discountPercent || ""}
                    onChange={e => {
                      const d = parseFloat(e.target.value) || 0;
                      setCart(prev => prev.map((i, ix) => ix !== idx ? i : { ...i, discountPercent: d, total: lineTotal(i.quantity, i.unitPrice, d) }));
                    }}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </td>
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
  const [craftsmanFilter, setCraftsmanFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const qc = useQueryClient();

  const craftsmenParams = {};
  const { data: craftsmenData } = useListCraftsmen(craftsmenParams, { query: { queryKey: getListCraftsmenQueryKey(craftsmenParams) } });
  const craftsmen = (craftsmenData as any)?.items || [];

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    craftsmanId: craftsmanFilter ? Number(craftsmanFilter) : undefined,
    limit: 100,
  };
  const { data, isLoading } = useListQuotations(params, { query: { queryKey: getListQuotationsQueryKey(params) } });
  const convertToInvoice = useConvertQuotationToInvoice();
  const duplicate = useDuplicateQuotation();
  const deleteQuotation = useDeleteQuotation();

  const handleDelete = async (id: number) => {
    await deleteQuotation.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    toast.success("تم حذف التسعيرة");
  };

  const handleConvert = async (id: number) => {
    await convertToInvoice.mutateAsync({ id, data: { paymentType: "cash" } });
    // Converting creates a sales invoice and deducts stock — refresh everything
    // (sales list, products/stock, dashboard), not just the quotations list.
    qc.invalidateQueries();
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
        <NewQuotationDialog open={showAdd} onClose={() => setShowAdd(false)} />
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
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="رقم التسعيرة أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || "__none__"} onValueChange={(v) => setStatusFilter(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={craftsmanFilter || "__none__"} onValueChange={(v) => setCraftsmanFilter(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="كل الصنايعية" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">كل الصنايعية</SelectItem>
                {craftsmen.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
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
                <th className="p-3">الصنايعي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3 text-left">الإجمالي</th>
                <th className="p-3">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                quotations.map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-medium text-primary">{q.serial}</td>
                    <td className="p-3 text-muted-foreground">{new Date(q.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3">{q.customerName || <span className="text-muted-foreground">غير محدد</span>}</td>
                    <td className="p-3">
                      {q.craftsmanName
                        ? <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs"><HardHat className="h-3 w-3" />{q.craftsmanName}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
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
                        <DeleteButton entity="quotations" id={q.id} label={`التسعيرة ${q.serial}`} onDelete={() => handleDelete(q.id)} />
                        <AuditInfo createdBy={q.createdBy} createdAt={q.createdAt} updatedBy={q.updatedBy} updatedAt={q.updatedAt} />
                      </div>
                    </td>
                  </tr>
                ))
              }
              {!isLoading && quotations.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
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
