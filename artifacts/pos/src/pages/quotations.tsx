import { Table } from "@/components/ui/table";
import { useEffect, useState, type SyntheticEvent } from "react";
import { useLocation } from "wouter";
import {
  useListQuotations,
  useCreateQuotation,
  useUpdateQuotation,
  useGetQuotation,
  useConvertQuotationToInvoice,
  useDuplicateQuotation,
  useDeleteQuotation,
  useListCustomers,
  useListCraftsmen,
  useSearchProducts,
  useGetSettings,
  getSearchProductsQueryKey,
  getListQuotationsQueryKey,
  getGetQuotationQueryKey,
  getListCraftsmenQueryKey,
} from "@workspace/api-client-react";
import { DeleteButton } from "@/components/ui/delete-confirm";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AuditInfo } from "@/components/ui/audit-info";
import { formatCurrency } from "@/lib/format";
import { printQuotation } from "@/lib/print-invoice";
import { PRINT_FORMATS, normalizeFormat, type PrintFormat } from "@/lib/print-document";
import { useBarcodeScanner, findProductByCode } from "@/hooks/use-barcode-scanner";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { cn } from "@/lib/utils";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { Search, Plus, FileText, ArrowRight, Copy, Trash2, Minus, HardHat, Printer, ChevronDown, Eye, Receipt, X } from "lucide-react";
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

/** A stored quotation line keeps its discount as an amount; the dialog edits it as a %. */
function toCartItem(it: any): CartItem {
  const gross = it.quantity * it.unitPrice;
  const discountPercent = gross ? ((it.discount || 0) / gross) * 100 : 0;
  return { productId: it.productId, productName: it.productName, quantity: it.quantity, unitPrice: it.unitPrice, discountPercent, total: lineTotal(it.quantity, it.unitPrice, discountPercent) };
}

const errorMessage = (e: any, fallback: string) => e?.data?.error || e?.message || fallback;

/**
 * One dialog for both a new quotation and an existing one. `quotationId` null =
 * new. An existing quotation opens with its saved lines and can be edited, saved,
 * printed, converted or duplicated; once converted it is view/print only (the
 * invoice was built from these lines).
 */
function QuotationDialog({ onClose, open, quotationId, onOpenQuotation }: {
  onClose: () => void;
  open: boolean;
  quotationId: number | null;
  onOpenQuotation?: (id: number) => void;
}) {
  const isNew = quotationId == null;
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [craftsmanId, setCraftsmanId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: searchResults } = useSearchProducts({ q: productSearch }, { query: { enabled: productSearch.length >= 1, queryKey: getSearchProductsQueryKey({ q: productSearch }) } });
  const { data: customers } = useListCustomers({ isActive: true });
  const { data: craftsmen } = useListCraftsmen({ isActive: true });
  const { data: settings } = useGetSettings();
  const shop = settings as any;
  const defaultFormat = normalizeFormat(shop?.defaultPrintTemplate);
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const convertToInvoice = useConvertQuotationToInvoice();
  const duplicate = useDuplicateQuotation();

  const existingId = quotationId ?? 0;
  const { data: existingData } = useGetQuotation(existingId, { query: { enabled: open && !isNew, queryKey: getGetQuotationQueryKey(existingId) } });
  const existing = isNew ? null : (existingData as any);
  // Converted → the invoice was built from these lines, so they're frozen.
  const readOnly = existing?.status === "converted";

  // What's on screen now vs. what was last loaded/saved — drives «حفظ التعديلات»
  // and the unsaved-changes warning on close.
  const snapshot = JSON.stringify({ cart, customerId, craftsmanId, discount, validUntil, notes });
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const loaded = isNew || savedSnapshot !== null;
  const dirty = isNew ? cart.length > 0 : loaded && snapshot !== savedSnapshot;

  // Fill the form from the stored quotation once it arrives.
  useEffect(() => {
    if (isNew || !existing || savedSnapshot !== null) return;
    const c = (existing.items || []).map(toCartItem);
    const cust = existing.customerId ? String(existing.customerId) : "";
    const craft = existing.craftsmanId ? String(existing.craftsmanId) : "";
    const disc = existing.discount || 0;
    const valid = existing.validUntil ? String(existing.validUntil).slice(0, 10) : "";
    const n = existing.notes || "";
    setCart(c); setCustomerId(cust); setCraftsmanId(craft); setDiscount(disc); setValidUntil(valid); setNotes(n);
    setSavedSnapshot(JSON.stringify({ cart: c, customerId: cust, craftsmanId: craft, discount: disc, validUntil: valid, notes: n }));
  }, [isNew, existing, savedSnapshot]);

  const addToCart = (p: any) => {
    if (readOnly) return;
    setCart(prev => {
      const ex = prev.find(i => i.productId === p.id);
      if (ex) return prev.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1, total: lineTotal(i.quantity + 1, i.unitPrice, i.discountPercent) } : i);
      return [...prev, { productId: p.id, productName: p.nameAr, quantity: 1, unitPrice: p.sellingPrice, discountPercent: 0, total: lineTotal(1, p.sellingPrice, 0) }];
    });
    setProductSearch("");
  };

  // Keyboard navigation for the search results (Arrow Up/Down + Enter).
  const productResults: any[] = productSearch && Array.isArray(searchResults) ? searchResults : [];
  const { activeIndex, onKeyDown: onSearchKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: productResults,
    onSelect: addToCart,
    resetKey: productSearch,
  });

  // Hardware laser scanner: scan a product → adds it to the quotation.
  useBarcodeScanner(
    async (code) => {
      const p = await findProductByCode(code);
      if (p) addToCart(p);
      else toast.error(`منتج غير موجود بالباركود: ${code}`);
    },
    { enabled: open && !readOnly },
  );

  const [restored, setRestored] = useState(false);
  const resetForm = () => {
    setCart([]); setCustomerId(""); setCraftsmanId(""); setDiscount(0); setValidUntil(""); setNotes(""); setRestored(false);
  };
  // Periodic auto-save of a NEW quotation → a power cut / refresh mid-quotation
  // won't lose the work. (An existing one is already safe in the database.)
  const { clearDraft } = useDraftAutosave({
    type: "quotation",
    entityId: "new",
    enabled: open && isNew,
    hasContent: cart.length > 0,
    data: { cart, customerId, craftsmanId, discount, validUntil, notes },
    onRestore: (p) => {
      if (!p?.cart?.length) return;
      setCart(p.cart);
      setCustomerId(p.customerId || "");
      setCraftsmanId(p.craftsmanId || "");
      setDiscount(p.discount || 0);
      setValidUntil(p.validUntil || "");
      setNotes(p.notes || "");
      setRestored(true);
    },
  });

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal - discount;

  const refreshLists = (id?: number) => {
    qc.invalidateQueries({ queryKey: getListQuotationsQueryKey({}) });
    if (id) qc.invalidateQueries({ queryKey: getGetQuotationQueryKey(id) });
  };

  /** Write what's on screen to the server (create or update) and return the stored quotation. */
  const persist = async (): Promise<any> => {
    const items = cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, discount: discountAmount(i.quantity, i.unitPrice, i.discountPercent) }));
    if (isNew) {
      const created = await createQuotation.mutateAsync({
        data: {
          customerId: customerId ? Number(customerId) : undefined,
          craftsmanId: craftsmanId ? Number(craftsmanId) : undefined,
          discount, validUntil: validUntil || undefined, notes: notes.trim() || undefined, status: "confirmed",
          items,
        },
      });
      clearDraft();
      refreshLists();
      return created;
    }
    if (readOnly || !dirty) return existing;
    const updated = await updateQuotation.mutateAsync({
      id: existingId,
      data: {
        customerId: customerId ? Number(customerId) : null,
        craftsmanId: craftsmanId ? Number(craftsmanId) : null,
        discount, validUntil: validUntil || null, notes: notes.trim() || null,
        items,
      },
    });
    setSavedSnapshot(snapshot);
    refreshLists(existingId);
    return updated;
  };

  /** Run an action that may save first; shows the server's message on failure. */
  const run = async (fn: () => Promise<void>, fallback: string) => {
    if (cart.length === 0) { toast.error("أضف منتجاً"); return; }
    setBusy(true);
    try { await fn(); }
    catch (e: any) { toast.error(errorMessage(e, fallback)); }
    finally { setBusy(false); }
  };

  const finishNew = () => { resetForm(); onClose(); };

  const handleSave = () => run(async () => {
    await persist();
    toast.success(isNew ? "تم حفظ التسعيرة" : "تم حفظ التعديلات");
    if (isNew) finishNew();
  }, "تعذّر حفظ التسعيرة");

  const handlePrint = (format: PrintFormat) => run(async () => {
    const saved = await persist();
    if (!printQuotation(saved, shop, format)) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
    if (isNew) { toast.success("تم حفظ التسعيرة"); finishNew(); }
  }, "تعذّر حفظ التسعيرة");

  const handleConvert = () => run(async () => {
    const saved = await persist();
    await convertToInvoice.mutateAsync({ id: saved.id, data: { paymentType: "cash" } });
    // Converting creates a sales invoice and deducts stock — refresh everything.
    qc.invalidateQueries();
    toast.success("تم تحويل التسعيرة إلى فاتورة");
    if (isNew) finishNew(); else onClose();
  }, "تعذّر تحويل التسعيرة");

  const handleDuplicate = () => run(async () => {
    const saved = await persist();
    const copy: any = await duplicate.mutateAsync({ id: saved.id });
    refreshLists();
    toast.success(`تم نسخ التسعيرة — ${copy.serial}`);
    if (isNew) finishNew();
    onOpenQuotation?.(copy.id);
  }, "تعذّر نسخ التسعيرة");

  const handleClose = () => {
    if (!isNew && dirty && !window.confirm("في تعديلات مش محفوظة. تقفل من غير حفظ؟")) return;
    onClose();
  };

  // An archived customer/craftsman isn't in the active pickers — keep the
  // quotation's own one selectable so its name still shows.
  const customerOptions: any[] = (customers as any)?.items || [];
  const craftsmanOptions: any[] = (craftsmen as any)?.items || [];
  const extraCustomer = existing?.customerId && !customerOptions.some(c => c.id === existing.customerId)
    ? { id: existing.customerId, name: existing.customerName } : null;
  const extraCraftsman = existing?.craftsmanId && !craftsmanOptions.some(c => c.id === existing.craftsmanId)
    ? { id: existing.craftsmanId, name: existing.craftsmanName } : null;
  const allCustomers = extraCustomer ? [extraCustomer, ...customerOptions] : customerOptions;
  const allCraftsmen = extraCraftsman ? [extraCraftsman, ...craftsmanOptions] : craftsmanOptions;

  const printMenu = (label: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy || !loaded}>
          <Printer className="h-4 w-4 ml-2" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 mr-1 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PRINT_FORMATS.map((f) => (
          <DropdownMenuItem key={f.key} onClick={() => handlePrint(f.key)}>
            طباعة {f.label}
            {defaultFormat === f.key && <span className="mr-auto text-xs text-muted-foreground">افتراضي</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    // hideClose: the built-in ✕ would close without the unsaved-changes check
    // (and it sits on top of the RTL title) — the header carries its own.
    <DialogContent
      hideClose
      className="max-w-[1340px] w-[96vw] max-h-[90vh] overflow-y-auto"
      onEscapeKeyDown={(e) => { if (!isNew && dirty) { e.preventDefault(); handleClose(); } }}
      onInteractOutside={(e) => { if (!isNew && dirty) { e.preventDefault(); handleClose(); } }}
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="إغلاق" onClick={handleClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">إغلاق</span>
          </Button>
          {isNew ? "تسعيرة جديدة" : <>تسعيرة <span className="font-mono">{existing?.serial || "…"}</span></>}
          {existing && <Badge variant={STATUS_LABELS[existing.status]?.variant}>{STATUS_LABELS[existing.status]?.label}</Badge>}
          {!isNew && dirty && <span className="text-xs font-normal text-amber-600 dark:text-amber-400">• تعديلات غير محفوظة</span>}
        </DialogTitle>
      </DialogHeader>
      {restored && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          <span>↩️ تم استرجاع مسودة محفوظة تلقائيًا</span>
          <Button variant="ghost" size="sm" className="h-6 text-amber-800 dark:text-amber-200" onClick={() => { resetForm(); clearDraft(); }}>ابدأ من جديد</Button>
        </div>
      )}
      {readOnly && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>
            التسعيرة دي اتحوّلت لفاتورة <span className="font-mono font-medium">{existing?.convertedInvoiceSerial}</span>،
            فهي للعرض والطباعة بس. لو عايز تعدّل فيها اعمل نسخة.
          </span>
          {existing?.convertedInvoiceId && (
            <Button variant="link" size="sm" className="h-6" onClick={() => { onClose(); navigate(`/sales?invoice=${existing.convertedInvoiceId}`); }}>
              <Receipt className="h-3.5 w-3.5 ml-1" /> فتح الفاتورة
            </Button>
          )}
        </div>
      )}

      {!loaded ? (
        <div className="p-10 text-center text-muted-foreground">جاري تحميل التسعيرة...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select disabled={readOnly} value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="اختر العميل (اختياري)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بدون عميل</SelectItem>
                {allCustomers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select disabled={readOnly} value={craftsmanId || "__none__"} onValueChange={(v) => setCraftsmanId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="الصنايعي (اختياري)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">بدون صنايعي</SelectItem>
                {allCraftsmen.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name} {c.jobType ? `(${c.jobType})` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" disabled={readOnly} value={validUntil} onChange={e => setValidUntil(e.target.value)} title="صالحة حتى" />
          </div>
          {(customerId || craftsmanId) && (
            <div className="flex gap-2 text-xs text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
              {customerId && <span>✓ العميل: {allCustomers.find((c: any) => String(c.id) === customerId)?.name}</span>}
              {craftsmanId && <span>✓ الصنايعي: {allCraftsmen.find((c: any) => String(c.id) === craftsmanId)?.name}</span>}
            </div>
          )}
          {!readOnly && (
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="ابحث عن منتج..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={onSearchKeyDown} />
            </div>
          )}
          {productSearch && !readOnly && (
            <div className="border rounded-lg overflow-hidden">
              {productResults.map((p: any, i: number) => (
                <div key={p.id} {...getItemProps(i)} className={cn("flex justify-between p-2 cursor-pointer border-b", activeIndex === i ? "nav-active" : "nav-hover")} onClick={() => addToCart(p)}>
                  <span>{p.nameAr} <span className="text-xs text-muted-foreground">({p.sku})</span></span>
                  <span className="font-semibold">{formatCurrency(p.sellingPrice)}</span>
                </div>
              ))}
              {!productResults.length && <div className="p-3 text-center text-muted-foreground">لا توجد نتائج</div>}
            </div>
          )}
          <Table className="wide-entry-table w-full text-sm table-fixed">
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
                      {!readOnly && (
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => { if (ix !== idx) return i; const q = Math.max(1, i.quantity - 1); return { ...i, quantity: q, total: lineTotal(q, i.unitPrice, i.discountPercent) }; }))}>
                          <Minus className="h-3 w-3" />
                        </Button>
                      )}
                      <span className="w-8 text-center">{item.quantity}</span>
                      {!readOnly && (
                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCart(prev => prev.map((i, ix) => { if (ix !== idx) return i; const q = i.quantity + 1; return { ...i, quantity: q, total: lineTotal(q, i.unitPrice, i.discountPercent) }; }))}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-left">{formatCurrency(item.unitPrice)}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <NumericInput
                        disabled={readOnly}
                        className="h-7 text-left"
                        placeholder="0"
                        title="نسبة خصم % — قيمة سالبة تعني إضافة على السعر"
                        value={item.discountPercent}
                        onValue={d => setCart(prev => prev.map((i, ix) => ix !== idx ? i : { ...i, discountPercent: d, total: lineTotal(i.quantity, i.unitPrice, d) }))}
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="p-2 text-left font-semibold">{formatCurrency(item.total)}</td>
                  <td className="p-2">
                    {!readOnly && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3" /></Button>}
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">ابحث عن منتج أو امسح الباركود لإضافته</td></tr>
              )}
            </tbody>
          </Table>
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-start gap-6">
            <div className="flex flex-1 flex-col gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0">خصم:</span>
                <NumericInput disabled={readOnly} className="w-24 h-7" placeholder="0" title="خصم على التسعيرة كلها — قيمة سالبة تعني إضافة" value={discount} onValue={setDiscount} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0">ملاحظات:</span>
                <Input disabled={readOnly} className="h-7 max-w-md" placeholder="تظهر في التسعيرة المطبوعة (اختياري)" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="text-left">
              <p className="text-sm text-muted-foreground">فرعي: {formatCurrency(subtotal)}</p>
              <p className="font-bold text-lg">الإجمالي: {formatCurrency(total)}</p>
            </div>
          </div>
        </>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" onClick={handleClose}>{isNew ? "إلغاء" : "إغلاق"}</Button>
        {!isNew && (
          <Button variant="outline" onClick={handleDuplicate} disabled={busy || !loaded} title="نسخة جديدة من التسعيرة دي تقدر تعدّل فيها">
            <Copy className="h-4 w-4 ml-2" /> {readOnly ? "نسخ للتعديل" : "نسخ"}
          </Button>
        )}
        {printMenu(isNew ? "حفظ وطباعة" : (dirty ? "حفظ وطباعة" : "طباعة"))}
        {!readOnly && existing?.status !== "cancelled" && (
          <Button variant="outline" onClick={handleConvert} disabled={busy || !loaded}>
            <ArrowRight className="h-4 w-4 ml-2" /> {dirty ? "حفظ وتحويل لفاتورة" : "تحويل لفاتورة"}
          </Button>
        )}
        {!readOnly && (
          <Button onClick={handleSave} disabled={busy || !loaded || (!isNew && !dirty)}>
            {isNew ? "حفظ التسعيرة" : "حفظ التعديلات"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

export default function QuotationsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [craftsmanFilter, setCraftsmanFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
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
    try {
      await convertToInvoice.mutateAsync({ id, data: { paymentType: "cash" } });
    } catch (e: any) { toast.error(errorMessage(e, "تعذّر تحويل التسعيرة")); return; }
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
  // Row buttons sit inside a clickable row — keep their clicks from opening it.
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <div className="space-y-4">
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <QuotationDialog open={showAdd} quotationId={null} onClose={() => setShowAdd(false)} onOpenQuotation={setOpenId} />
      </Dialog>
      {/* An existing quotation. Keyed by id so opening another one starts fresh. */}
      <Dialog open={openId != null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        {openId != null && (
          <QuotationDialog key={openId} open quotationId={openId} onClose={() => setOpenId(null)} onOpenQuotation={setOpenId} />
        )}
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
          <Table className="w-full text-sm">
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
                  <tr key={q.id} className="border-b nav-hover cursor-pointer" onClick={() => setOpenId(q.id)} title="اضغط لفتح التسعيرة">
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
                    <td className="p-3" onClick={stop}>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setOpenId(q.id)}>
                          <Eye className="h-3 w-3 ml-1" /> {q.status === "converted" ? "عرض" : "فتح"}
                        </Button>
                        {q.status !== "converted" && q.status !== "cancelled" && (
                          <Button variant="outline" size="sm" onClick={() => handleConvert(q.id)} disabled={convertToInvoice.isPending}>
                            <ArrowRight className="h-3 w-3 ml-1" /> تحويل
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicate(q.id)} title="نسخ">
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
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
