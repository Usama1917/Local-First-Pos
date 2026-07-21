import { useState, useEffect } from "react";
import {
  useListPurchaseInvoices,
  useCreatePurchaseInvoice,
  useFinalizePurchaseInvoice,
  useGetPurchaseInvoice,
  useUpdatePurchaseInvoice,
  useDeletePurchaseInvoice,
  useListSuppliers,
  useListProducts,
  useGetSettings,
  useSearchProducts,
  getSearchProductsQueryKey,
  getGetPurchaseInvoiceQueryKey,
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
import { useBarcodeScanner, findProductByCode } from "@/hooks/use-barcode-scanner";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { cn } from "@/lib/utils";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { printLabels } from "@/lib/print-labels";
import { AuditInfo } from "@/components/ui/audit-info";
import { DeleteButton } from "@/components/ui/delete-confirm";
import { Search, Plus, ShoppingBag, CheckCircle, Trash2, Printer, Ban } from "lucide-react";
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
  productId: number; productName: string; sku: string; barcode: string; soldByWeight: boolean; quantity: number;
  listPrice: number; supplierDiscount: number; netPrice: number; extraCost: number; trueCost: number; total: number;
  print: boolean;
}

function NewPurchaseDialog({ onClose, open, invoiceId }: { onClose: () => void; open: boolean; invoiceId: number | null }) {
  const [supplierId, setSupplierId] = useState("");
  const [paymentType, setPaymentType] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const qc = useQueryClient();
  const isExisting = invoiceId != null;
  const { data: suppliers } = useListSuppliers({ isActive: true });
  const { data: settings } = useGetSettings();
  const shopName = (settings as any)?.shopName as string | undefined;
  const { data: searchResults } = useSearchProducts({ q: productSearch }, { query: { enabled: productSearch.length >= 1, queryKey: getSearchProductsQueryKey({ q: productSearch }) } });
  const { data: loaded } = useGetPurchaseInvoice(invoiceId as number, { query: { enabled: isExisting, queryKey: getGetPurchaseInvoiceQueryKey(invoiceId as number) } });
  const createPurchase = useCreatePurchaseInvoice();
  const updatePurchase = useUpdatePurchaseInvoice();
  const finalizePurchase = useFinalizePurchaseInvoice();
  const deletePurchase = useDeletePurchaseInvoice();

  // An existing invoice can only be edited while it's still a draft; once
  // finalized it's view-only (you can still re-print its barcodes).
  const status = (loaded as any)?.status;
  const serial = (loaded as any)?.serial as string | undefined;
  const readOnly = isExisting && status != null && status !== "draft";

  // Load an existing invoice's data into the form once it arrives.
  useEffect(() => {
    if (!loaded) return;
    const inv = loaded as any;
    setSupplierId(inv.supplierId ? String(inv.supplierId) : "");
    setPaymentType(inv.paymentType || "cash");
    setPaidAmount(inv.paidAmount != null ? String(inv.paidAmount) : "");
    setInvoiceDate(inv.invoiceDate || (inv.createdAt ? String(inv.createdAt).split("T")[0] : new Date().toISOString().split("T")[0]));
    setNotes(inv.notes || "");
    setItems((inv.items || []).map((it: any) => ({
      productId: it.productId,
      productName: it.productName || "",
      sku: it.sku || "",
      barcode: it.barcode || "",
      soldByWeight: !it.barcode,
      quantity: it.quantity || 1,
      listPrice: it.listPrice || 0,
      supplierDiscount: it.supplierDiscount || 0,
      netPrice: it.netPrice || 0,
      extraCost: it.extraCost || 0,
      trueCost: it.trueCost || 0,
      total: it.total || 0,
      print: !!it.barcode,
    })));
  }, [loaded]);

  const addProduct = (p: any) => {
    setItems(prev => {
      // Already on the invoice → bump its quantity (so a repeat scan counts another unit).
      if (prev.find(i => i.productId === p.id)) {
        return prev.map(i => i.productId === p.id
          ? { ...i, quantity: i.quantity + 1, total: i.trueCost * (i.quantity + 1) }
          : i);
      }
      const disc = p.supplierDiscount || 30;
      const net = p.listPrice * (1 - disc / 100);
      const extra = p.extraCost || 0;
      const trueCost = net + extra;
      const soldByWeight = !!p.soldByWeight;
      const barcode = soldByWeight ? "" : (p.barcode || "");
      return [...prev, {
        productId: p.id, productName: p.nameAr, sku: p.sku || "", barcode, soldByWeight, quantity: 1,
        listPrice: p.listPrice || 0, supplierDiscount: disc, netPrice: net, extraCost: extra, trueCost, total: trueCost,
        print: !!barcode, // only items that carry a barcode get stickers
      }];
    });
    setProductSearch("");
  };

  // Keyboard navigation for the search results (Arrow Up/Down + Enter).
  const productResults: any[] = productSearch && Array.isArray(searchResults) ? searchResults : [];
  const { activeIndex, onKeyDown: onSearchKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: productResults,
    onSelect: addProduct,
    resetKey: productSearch,
  });

  // Hardware laser scanner: scan a product → adds it to the purchase invoice.
  useBarcodeScanner(
    async (code) => {
      const p = await findProductByCode(code);
      if (p) addProduct(p);
      else toast.error(`منتج غير موجود بالباركود: ${code}`);
    },
    { enabled: open },
  );

  const [restored, setRestored] = useState(false);
  const resetForm = () => {
    setItems([]); setSupplierId(""); setPaymentType("cash"); setPaidAmount(""); setNotes(""); setRestored(false);
  };
  // Periodic auto-save → a power cut / refresh mid-purchase won't lose the work.
  // Only for a brand-new invoice; an existing one already lives in the DB.
  const { clearDraft } = useDraftAutosave({
    type: "purchase",
    entityId: "new",
    enabled: open && !isExisting,
    hasContent: items.length > 0,
    data: { items, supplierId, paymentType, paidAmount, invoiceDate, notes },
    onRestore: (p) => {
      if (!p?.items?.length) return;
      setItems(p.items.map((it: any) => ({
        ...it,
        sku: it.sku ?? "",
        barcode: it.soldByWeight ? "" : (it.barcode ?? ""),
        soldByWeight: !!it.soldByWeight,
        print: it.print ?? !!it.barcode,
      })));
      setSupplierId(p.supplierId || "");
      setPaymentType(p.paymentType || "cash");
      setPaidAmount(p.paidAmount || "");
      setInvoiceDate(p.invoiceDate || invoiceDate);
      setNotes(p.notes || "");
      setRestored(true);
    },
  });

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

  const togglePrint = (idx: number) =>
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, print: !it.print } : it)));

  const total = items.reduce((s, i) => s + i.total, 0);

  // Build the printable stickers list (one per added unit; no-barcode items skipped).
  const buildLabels = (respectToggle: boolean) =>
    items
      .filter(i => i.barcode && (!respectToggle || i.print !== false))
      .map(i => ({ barcode: i.barcode, name: i.productName, sku: i.sku, copies: Math.round(i.quantity) }))
      .filter(l => l.copies >= 1);

  const handleSave = async (finalize = false) => {
    if (items.length === 0) { toast.error("أضف منتجاً"); return; }
    try {
      const fp = paymentType === "cash" ? total : parseFloat(paidAmount) || 0;
      const payloadItems = items.map(i => ({ productId: i.productId, quantity: i.quantity, listPrice: i.listPrice, supplierDiscount: i.supplierDiscount, netPrice: i.netPrice, extraCost: i.extraCost, trueCost: i.trueCost, total: i.total }));
      let targetId = invoiceId;
      if (isExisting) {
        // Update the existing draft in place.
        await updatePurchase.mutateAsync({
          id: invoiceId as number,
          data: {
            supplierId: supplierId ? Number(supplierId) : undefined,
            paymentType: paymentType as any, paidAmount: fp, notes: notes || undefined,
            invoiceDate, items: payloadItems,
          },
        });
      } else {
        const inv = await createPurchase.mutateAsync({
          data: {
            supplierId: supplierId ? Number(supplierId) : undefined,
            paymentType: paymentType as any, paidAmount: fp, notes: notes || undefined,
            invoiceDate, status: "draft", items: payloadItems,
          },
        });
        targetId = (inv as any).id;
      }
      if (finalize) {
        await finalizePurchase.mutateAsync({ id: targetId as number, data: { paymentType: paymentType as any, paidAmount: fp } });
        toast.success("تم حفظ وإنهاء فاتورة المشتريات");
        // Stock just went up → print a sticker per added unit. Items with no
        // barcode (sold-by-weight) are skipped automatically.
        const labels = buildLabels(true);
        if (labels.length && !printLabels(labels, shopName)) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
      } else {
        toast.success(isExisting ? "تم حفظ التعديلات" : "تم حفظ الفاتورة كمسودة");
      }
      qc.invalidateQueries({ queryKey: getListPurchaseInvoicesQueryKey({}) });
      if (!isExisting) clearDraft();
      resetForm();
      onClose();
    } catch (e: any) { toast.error(e.message || "خطأ"); }
  };

  const handleDelete = async () => {
    await deletePurchase.mutateAsync({ id: invoiceId as number });
    qc.invalidateQueries();
    toast.success("تم حذف الفاتورة");
    onClose();
  };

  const handleReprint = () => {
    const labels = buildLabels(false);
    if (!labels.length) { toast.error("مفيش أصناف بباركود للطباعة"); return; }
    if (!printLabels(labels, shopName)) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
  };

  return (
    <DialogContent className="max-w-[1340px] w-[96vw] max-h-[94vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>
          {!isExisting ? "فاتورة مشتريات جديدة" : readOnly ? `فاتورة مشتريات — ${serial || ""}` : `تعديل مسودة — ${serial || ""}`}
        </DialogTitle>
      </DialogHeader>
      {readOnly && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          🔒 الفاتورة دي مكتملة — للعرض فقط. تقدر تعيد طباعة الباركود بس.
        </div>
      )}
      {restored && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>↩️ تم استرجاع مسودة محفوظة تلقائيًا</span>
          <Button variant="ghost" size="sm" className="h-6 text-amber-800 dark:text-amber-200" onClick={() => { resetForm(); clearDraft(); }}>ابدأ من جديد</Button>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>المورد</Label>
          <Select value={supplierId} onValueChange={setSupplierId} disabled={readOnly}>
            <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
            <SelectContent>{(suppliers as any)?.items?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>التاريخ</Label><Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} disabled={readOnly} /></div>
        <div className="space-y-1">
          <Label>الدفع</Label>
          <Select value={paymentType} onValueChange={setPaymentType} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">نقدي</SelectItem>
              <SelectItem value="credit">آجل</SelectItem>
              <SelectItem value="partial">جزئي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentType === "partial" && (
          <div className="col-span-2 space-y-1"><Label>المدفوع</Label><Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} disabled={readOnly} /></div>
        )}
      </div>

      {!readOnly && (
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
          <Input className="pr-9" placeholder="ابحث عن منتج للإضافة..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={onSearchKeyDown} />
          {productSearch && productResults.length > 0 && (
            <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
              {productResults.map((p: any, i: number) => (
                <div key={p.id} {...getItemProps(i)} className={cn("flex justify-between gap-2 p-2 cursor-pointer border-b last:border-b-0", activeIndex === i ? "nav-active" : "nav-hover")} onClick={() => addProduct(p)}>
                  <span>{p.nameAr} <span className="text-xs text-muted-foreground">({p.sku})</span></span>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">قائمة: {formatCurrency(p.listPrice)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-right w-[18%]">المنتج</th>
              <th className="p-2 text-center w-[9%]">الكمية</th>
              <th className="p-2 text-left w-[10%]">سعر القائمة</th>
              <th className="p-2 text-left w-[9%]">خصم %</th>
              <th className="p-2 text-left w-[10%]">صافي شراء</th>
              <th className="p-2 text-left w-[9%]">تكاليف</th>
              <th className="p-2 text-left w-[10%]">التكلفة</th>
              <th className="p-2 text-left w-[10%]">الإجمالي</th>
              <th className="p-2 text-center w-[10%]">ستيكر</th>
              <th className="p-2 w-[5%]"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b">
                <td className="p-2 font-medium truncate">{item.productName}</td>
                <td className="p-2"><Input type="number" disabled={readOnly} className="h-7 text-xs text-center w-full" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value === "" ? item.quantity : (parseFloat(e.target.value) || 0))} /></td>
                <td className="p-2"><Input type="number" disabled={readOnly} className="h-7 text-xs w-full" value={item.listPrice} onChange={e => updateItem(idx, "listPrice", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2"><Input type="number" disabled={readOnly} className="h-7 text-xs w-full" value={item.supplierDiscount} onChange={e => updateItem(idx, "supplierDiscount", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2 text-left text-muted-foreground">{formatCurrency(item.netPrice)}</td>
                <td className="p-2"><Input type="number" disabled={readOnly} className="h-7 text-xs w-full" value={item.extraCost} onChange={e => updateItem(idx, "extraCost", parseFloat(e.target.value) || 0)} /></td>
                <td className="p-2 text-left font-medium">{formatCurrency(item.trueCost)}</td>
                <td className="p-2 text-left font-bold">{formatCurrency(item.total)}</td>
                <td className="p-2 text-center">
                  {item.barcode ? (
                    readOnly ? (
                      <span className="text-xs font-semibold">{Math.round(item.quantity)}</span>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className={`h-7 w-7 ${item.print ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} onClick={() => togglePrint(idx)} title={item.print ? "هيطبع ستيكر" : "مش هيطبع"}>
                          {item.print ? <Printer className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        </Button>
                        <span className="text-xs font-semibold w-5 text-center">{item.print ? Math.round(item.quantity) : "—"}</span>
                      </div>
                    )
                  ) : <span className="text-xs text-muted-foreground">بدون باركود</span>}
                </td>
                <td className="p-2">{!readOnly && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>}</td>
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
        {readOnly ? (
          <>
            <Button variant="outline" onClick={onClose}>إغلاق</Button>
            <Button onClick={handleReprint}><Printer className="h-4 w-4 ml-2" />إعادة طباعة الباركود</Button>
          </>
        ) : (
          <>
            {isExisting && (
              <div className="me-auto">
                <DeleteButton entity="purchases" id={invoiceId as number} label={`المسودة ${serial || ""}`} variant="button" onDelete={handleDelete} />
              </div>
            )}
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={createPurchase.isPending || updatePurchase.isPending}>
              {isExisting ? "حفظ التعديلات" : "حفظ مسودة"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={createPurchase.isPending || updatePurchase.isPending || finalizePurchase.isPending}>
              <CheckCircle className="h-4 w-4 ml-2" />
              إنهاء الفاتورة
            </Button>
          </>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

export default function PurchasesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // null  = nothing open · "new" = blank invoice · number = an existing invoice's id
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const params = { search: search || undefined, status: statusFilter || undefined, limit: 100 };
  const { data, isLoading } = useListPurchaseInvoices(params, { query: { queryKey: getListPurchaseInvoicesQueryKey(params) } });
  const invoices = (data as any)?.items || [];
  // Keyboard navigation for the invoices table (Arrow Up/Down + Enter opens the row).
  const { activeIndex, onKeyDown: onSearchKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: invoices,
    onSelect: (inv: any) => setOpenId(inv.id),
    resetKey: search,
    highlightFirst: false, // full-page table: no row pre-selected until keyboard nav
  });
  const closeDialog = () => setOpenId(null);
  const qc = useQueryClient();
  const deletePurchase = useDeletePurchaseInvoice();

  const handleRowDelete = async (id: number) => {
    await deletePurchase.mutateAsync({ id });
    // Deleting a finalized purchase touches stock and the supplier's balance.
    qc.invalidateQueries();
    toast.success("تم حذف فاتورة المشتريات وعكس آثارها (مخزون/حساب المورد)");
  };

  return (
    <div className="space-y-4">
      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        {openId !== null && (
          <NewPurchaseDialog
            key={openId}
            open
            invoiceId={openId === "new" ? null : openId}
            onClose={closeDialog}
          />
        )}
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المشتريات</h1>
        <Button onClick={() => setOpenId("new")}><Plus className="h-4 w-4 ml-2" />فاتورة مشتريات</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="رقم الفاتورة أو المورد..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} />
          </div>
          <Select value={statusFilter || "__none__"} onValueChange={(v) => setStatusFilter(v === "__none__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">كل الحالات</SelectItem>
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
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              invoices.map((inv: any, i: number) => (
                <tr key={inv.id} {...getItemProps(i)} className={cn("border-b cursor-pointer", activeIndex === i ? "nav-active" : "nav-hover")} onClick={() => setOpenId(inv.id)} title={inv.status === "draft" ? "فتح المسودة لإكمالها" : "عرض الفاتورة"}>
                  <td className="p-3 font-mono font-medium text-primary">{inv.serial}</td>
                  <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3">{inv.supplierName || "—"}</td>
                  <td className="p-3"><Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge></td>
                  <td className="p-3 text-left font-semibold">{formatCurrency(inv.total)}</td>
                  <td className="p-3 text-left">{inv.remainingAmount > 0 ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span> : <span className="text-emerald-600 dark:text-emerald-400">مسدد</span>}</td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <DeleteButton entity="purchases" id={inv.id} label={`فاتورة المشتريات ${inv.serial}`} onDelete={() => handleRowDelete(inv.id)} />
                      <AuditInfo createdBy={inv.createdBy} createdAt={inv.createdAt} updatedBy={inv.updatedBy} updatedAt={inv.updatedAt} />
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && invoices.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-30" />لا توجد فواتير مشتريات
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
