import { useState, useEffect, useCallback, useRef } from "react";
import {
  useSearchProducts,
  getSearchProductsQueryKey,
  useCreateSalesInvoice,
  useFinalizeSalesInvoice,
  useListCustomers,
  useListCraftsmen,
  useSaveDraft,
  useGetDraft,
  useDeleteDraft,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBarcodeScanner, findProductByCode } from "@/hooks/use-barcode-scanner";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { useHotkeys, type Hotkey } from "@/hooks/use-hotkeys";
import { ShortcutHintBar } from "@/components/shortcut-hint-bar";
import { beep } from "@/lib/feedback";
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface CartItem {
  productId: number;
  productName: string;
  sku: string;
  sellingPrice: number;
  minSellingPrice: number;
  soldByWeight: number;
  quantity: number;
  discount: number;
  total: number;
}

/**
 * Numeric input that tolerates partial entry while typing ("-", "5.", "-3.")
 * — a plain controlled input would re-render a lone "-" away because it parses
 * to NaN→0. Local text state holds what's typed; the parsed number is pushed up
 * on every valid change, and the text re-syncs from the prop when not focused.
 */
function NumericInput({ value, onValue, ...props }: { value: number; onValue: (n: number) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const fmt = (n: number) => (n ? String(Math.round(n * 100) / 100) : "");
  const [text, setText] = useState(() => fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    // Re-sync when not focused; while focused, only re-sync if the parent clamped
    // a COMPLETE number we'd typed (leave partial entries like "5." or "-" alone).
    if (!focused.current) { setText(fmt(value)); return; }
    if (/^-?\d+(\.\d+)?$/.test(text) && parseFloat(text) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      type="number"
      {...props}
      value={text}
      onFocus={(e) => { focused.current = true; props.onFocus?.(e); }}
      onBlur={(e) => { focused.current = false; setText(fmt(value)); props.onBlur?.(e); }}
      onChange={(e) => {
        const t = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(t)) return; // digits, one optional leading minus & decimal point
        setText(t);
        const n = parseFloat(t);
        onValue(Number.isNaN(n) ? 0 : n);
      }}
    />
  );
}

export default function POSPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [craftsmanId, setCraftsmanId] = useState<string>("");
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "partial">("cash");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const draftSaved = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();
  const { data: searchResults } = useSearchProducts({ q: searchQuery }, { query: { enabled: searchQuery.length >= 1, queryKey: getSearchProductsQueryKey({ q: searchQuery }) } });
  // Only active customers/craftsmen are selectable (archived ones are hidden).
  const { data: customersData } = useListCustomers({ isActive: true });
  const { data: craftsmenData } = useListCraftsmen({ isActive: true });
  const createInvoice = useCreateSalesInvoice();
  const finalizeInvoice = useFinalizeSalesInvoice();
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();
  const { data: existingDraft } = useGetDraft("sales_invoice", "new");

  useEffect(() => {
    if (existingDraft && !draftSaved.current && cart.length === 0) {
      try {
        const parsed = JSON.parse(existingDraft.data);
        if (parsed?.cart?.length > 0) {
          setDraftData(parsed);
          setShowDraftDialog(true);
        }
      } catch {}
    }
  }, [existingDraft]);

  const autoSave = useCallback(() => {
    if (cart.length === 0) return;
    saveDraft.mutate({
      data: {
        type: "sales_invoice",
        entityId: "new",
        data: JSON.stringify({ cart, customerId, craftsmanId, invoiceDiscount, paymentType, paidAmount, notes }),
      },
    });
  }, [cart, customerId, craftsmanId, invoiceDiscount, paymentType, paidAmount, notes]);

  useEffect(() => {
    const timer = setTimeout(autoSave, 2000);
    return () => clearTimeout(timer);
  }, [autoSave]);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  // Clamp so an over-discount (or a stale discount after items were removed) can
  // never make the total negative and fabricate customer credit/debt.
  const total = Math.max(0, subtotal - invoiceDiscount);

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.sellingPrice - i.discount }
          : i
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.nameAr,
        sku: product.sku,
        sellingPrice: product.sellingPrice,
        minSellingPrice: product.minSellingPrice || 0,
        soldByWeight: product.soldByWeight ? 1 : 0,
        quantity: 1,
        discount: 0,
        total: product.sellingPrice,
      }];
    });
    setSearchQuery("");
    beep("add"); // one confirming blip for every add path (click, Enter, scan)
  };

  // Keyboard navigation for the search results (Arrow Up/Down + Enter).
  const productResults: any[] = searchQuery && Array.isArray(searchResults) ? searchResults : [];
  const { activeIndex, onKeyDown: onSearchKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: productResults,
    onSelect: addToCart,
    resetKey: searchQuery,
  });

  // Hardware laser scanner: scan a product barcode anywhere on the page → adds it to the cart.
  useBarcodeScanner(
    async (code) => {
      const p = await findProductByCode(code);
      if (p) addToCart(p);
      else { beep("error"); toast.error(`منتج غير موجود بالباركود: ${code}`); }
    },
    { enabled: !showFinalizeDialog && !showDraftDialog },
  );

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      // By-piece products stay integer (floor 1); by-weight can go fractional.
      const floor = item.soldByWeight ? 0.5 : 1;
      const qty = Math.max(floor, item.quantity + delta);
      const gross = qty * item.sellingPrice;
      const disc = Math.min(item.discount, gross); // a smaller qty must not leave discount > line value
      return { ...item, quantity: qty, discount: disc, total: gross - disc };
    }));
  };

  // Set an exact quantity (typed) — by-weight products allow fractional; by-piece
  // rounds to whole units. Used by the editable quantity field.
  const setQty = (idx: number, raw: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const floor = item.soldByWeight ? 0.001 : 1;
      let qty = item.soldByWeight ? raw : Math.round(raw);
      if (!(qty >= floor)) qty = floor;
      const gross = qty * item.sellingPrice;
      const disc = Math.min(item.discount, gross);
      return { ...item, quantity: qty, discount: disc, total: gross - disc };
    }));
  };

  // A NEGATIVE discount is a surcharge (adds to the line). Only the upper bound
  // is clamped so the line total can never go below zero.
  const updateDiscount = (idx: number, disc: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = item.quantity * item.sellingPrice;
      const d = Math.min(disc, gross); // discount ≤ line value (no negative totals); negatives allowed
      return { ...item, discount: d, total: gross - d };
    }));
  };

  // Editing the line total directly back-computes the discount (negative = surcharge).
  // Re-derive total from the rounded discount (the server's exact formula) so the
  // cart total is bit-identical to the backend and a cash sale settles to remaining 0.
  const updateLineTotal = (idx: number, t: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const gross = item.quantity * item.sellingPrice;
      const d = Math.round((gross - Math.max(0, t)) * 100) / 100;
      return { ...item, discount: d, total: Math.max(0, gross - d) };
    }));
  };

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const clearCart = () => {
    setCart([]);
    setCustomerId("");
    setCraftsmanId("");
    setInvoiceDiscount(0);
    setPaymentType("cash");
    setPaidAmount("");
    setNotes("");
    deleteDraft.mutate({ type: "sales_invoice", entityId: "new" });
  };

  const handleFinalize = async () => {
    if (cart.length === 0) { toast.error("السلة فارغة"); return; }
    const fp = paymentType === "cash" ? total : paymentType === "credit" ? 0 : parseFloat(paidAmount) || 0;
    try {
      const inv = await createInvoice.mutateAsync({
        data: {
          customerId: customerId ? Number(customerId) : undefined,
          craftsmanId: craftsmanId ? Number(craftsmanId) : undefined,
          paymentType,
          paidAmount: fp,
          discount: invoiceDiscount,
          notes: notes || undefined,
          items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.sellingPrice, discount: i.discount })),
        },
      });
      await finalizeInvoice.mutateAsync({ id: inv.id, data: { paymentType, paidAmount: fp } });
      // Stock, customer debt and dashboard all just changed — refresh caches so the
      // next search/customer view isn't stale for up to 30s.
      qc.invalidateQueries();
      beep("success");
      toast.success(`تم إنشاء الفاتورة ${inv.serial} بنجاح`);
      setShowFinalizeDialog(false);
      clearCart();
    } catch (e: any) {
      beep("error");
      toast.error(e.message || "خطأ أثناء إنشاء الفاتورة");
    }
  };

  const restoreDraft = () => {
    if (!draftData) return;
    setCart(draftData.cart || []);
    setCustomerId(draftData.customerId || "");
    setCraftsmanId(draftData.craftsmanId || "");
    setInvoiceDiscount(draftData.invoiceDiscount || 0);
    setPaymentType(draftData.paymentType || "cash");
    setPaidAmount(draftData.paidAmount || "");
    setNotes(draftData.notes || "");
    setShowDraftDialog(false);
    toast.success("تم استعادة المسودة");
  };

  const customers = customersData?.items || [];
  const craftsmen = craftsmenData?.items || [];

  // Cross-platform cashier shortcuts. "mod" = ⌘ on macOS / Ctrl on Windows, so
  // every binding works on both the dev Mac and the shop PC. Modifier + F-key
  // combos fire even while a field is focused; plain "/" only when not typing.
  const openFinalize = () => {
    if (showFinalizeDialog || showDraftDialog) return;
    if (cart.length === 0) { beep("warn"); toast.info("السلة فارغة"); return; }
    setShowFinalizeDialog(true);
  };
  const hotkeys: Hotkey[] = [
    { combo: "mod+k", label: "بحث", allowInInput: true, run: () => searchRef.current?.focus() },
    { combo: "/", label: "بحث", run: () => searchRef.current?.focus() },
    { combo: "f2", label: "إنهاء الفاتورة", allowInInput: true, run: openFinalize },
    { combo: "mod+enter", label: "تأكيد", allowInInput: true, run: () => { if (showFinalizeDialog) handleFinalize(); else openFinalize(); } },
    { combo: "mod+backspace", label: "مسح السلة", allowInInput: true, run: () => { if (cart.length) { clearCart(); beep("warn"); } } },
  ];
  useHotkeys(hotkeys);

  const shortcutHints = [
    { combo: "mod+k", label: "بحث" },
    { combo: "f2", label: "إنهاء" },
    { combo: "mod+enter", label: "تأكيد الدفع" },
    { combo: "mod+backspace", label: "مسح السلة" },
  ];

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>مسودة غير مكتملة</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">تم العثور على مسودة غير مكتملة. هل تريد استكمالها أم حذفها؟</p>
          <DialogFooter className="flex gap-2">
            <Button onClick={restoreDraft}>استكمال المسودة</Button>
            <Button variant="outline" onClick={() => { deleteDraft.mutate({ type: "sales_invoice", entityId: "new" }); setShowDraftDialog(false); }}>حذف وبدء جديد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إنهاء الفاتورة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-1">
              <div className="flex justify-between text-sm"><span>الإجمالي الفرعي:</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span>الخصم:</span><span>- {formatCurrency(invoiceDiscount)}</span></div>
              <div className="flex justify-between font-bold text-lg border-t pt-2"><span>الإجمالي:</span><span className="text-primary">{formatCurrency(total)}</span></div>
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={paymentType} onValueChange={(v: any) => setPaymentType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="credit">آجل</SelectItem>
                  <SelectItem value="partial">جزئي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentType === "partial" && (
              <div className="space-y-2">
                <Label>المبلغ المدفوع</Label>
                <Input type="number" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} placeholder="0.00" />
                <p className="text-xs text-muted-foreground">المتبقي: {formatCurrency(total - parseFloat(paidAmount || "0"))}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>إلغاء</Button>
            <Button onClick={handleFinalize} disabled={createInvoice.isPending || finalizeInvoice.isPending}>
              <CheckCircle className="h-4 w-4 ml-2" />
              {createInvoice.isPending || finalizeInvoice.isPending ? "جاري الإنشاء..." : "إنهاء الفاتورة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search Panel */}
      <div className="w-80 flex flex-col gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="pr-9"
                placeholder="ابحث بالاسم أو الكود أو الباركود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                autoFocus
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex-1 overflow-y-auto space-y-2">
          {productResults.map((p: any, i: number) => (
            <Card
              key={p.id}
              {...getItemProps(i)}
              className={cn(
                "cursor-pointer transition-colors",
                activeIndex === i ? "nav-active" : "hover:border-primary",
              )}
              onClick={() => addToCart(p)}
            >
              <CardContent className="p-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight">{p.nameAr}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                    {p.categoryName && <Badge variant="secondary" className="text-xs mt-1">{p.categoryName}</Badge>}
                  </div>
                  <div className="text-left mr-2">
                    <p className="font-bold text-primary text-sm">{formatCurrency(p.sellingPrice)}</p>
                    <p className={`text-xs ${p.currentStock <= p.minStock ? "text-destructive" : "text-muted-foreground"}`}>
                      مخزون: {p.currentStock}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {searchQuery && !(searchResults as any[])?.length && (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد منتجات</p>
            </div>
          )}
          {!searchQuery && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>ابحث عن منتج لإضافته</p>
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex gap-2">
          <Select value={customerId || "__none__"} onValueChange={(v) => setCustomerId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="اختر العميل (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">عميل نقدي</SelectItem>
              {customers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={craftsmanId || "__none__"} onValueChange={(v) => setCraftsmanId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="صنايعي (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">بدون صنايعي</SelectItem>
              {craftsmen.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              السلة ({cart.length} صنف)
            </CardTitle>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart}>
                <X className="h-4 w-4 ml-1" />
                مسح الكل
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            {cart.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>السلة فارغة</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-xs text-muted-foreground">
                    <th className="p-3 text-right">المنتج</th>
                    <th className="p-3 text-center w-32">الكمية</th>
                    <th className="p-3 text-center w-28">السعر</th>
                    <th className="p-3 text-center w-24">خصم</th>
                    <th className="p-3 text-left w-28">الإجمالي</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => {
                    const unitNet = item.quantity > 0 ? item.total / item.quantity : item.sellingPrice;
                    const belowMin = item.minSellingPrice > 0 && unitNet < item.minSellingPrice;
                    return (
                    <tr key={idx} className="border-b nav-hover">
                      <td className="p-3">
                        <p className="font-medium text-sm">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                        {belowMin && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            السعر أقل من الحد المسموح ({formatCurrency(item.minSellingPrice)})
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(idx, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          {/* Editable so weight products (or large counts) can be typed directly. */}
                          <NumericInput
                            className="h-7 w-14 text-center font-semibold px-1"
                            value={item.quantity}
                            onValue={n => setQty(idx, n)}
                            title={item.soldByWeight ? "الكمية (تقبل الكسور)" : "العدد"}
                          />
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(idx, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-3 text-center text-sm">{formatCurrency(item.sellingPrice)}</td>
                      <td className="p-3">
                        <NumericInput
                          className={`h-7 text-xs text-center ${belowMin ? "border-amber-500 focus-visible:ring-amber-500" : ""}`}
                          value={item.discount}
                          onValue={n => updateDiscount(idx, n)}
                          placeholder="0"
                          title="خصم بالجنيه — قيمة سالبة تعني إضافة على السعر"
                        />
                      </td>
                      <td className="p-3">
                        <NumericInput
                          className="h-7 text-sm text-left font-bold text-primary"
                          value={item.total}
                          onValue={n => updateLineTotal(idx, n)}
                          placeholder="0"
                          title="عدّل الإجمالي مباشرة — الفرق يتسجل كخصم أو إضافة على الصنف"
                        />
                      </td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Totals & Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-4 items-end">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">الإجمالي الفرعي:</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">خصم الفاتورة:</span>
                  <NumericInput className="h-7 w-32 text-sm" value={invoiceDiscount} onValue={(n) => setInvoiceDiscount(Math.min(n, subtotal))} placeholder="0" title="خصم على الفاتورة كلها — قيمة سالبة تعني إضافة" />
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>الإجمالي:</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="lg" className="h-14 px-8 text-base" onClick={() => setShowFinalizeDialog(true)} disabled={cart.length === 0}>
                  <CheckCircle className="h-5 w-5 ml-2" />
                  إنهاء الفاتورة
                </Button>
              </div>
            </div>
            <ShortcutHintBar items={shortcutHints} className="mt-3 border-t pt-3 no-print" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
