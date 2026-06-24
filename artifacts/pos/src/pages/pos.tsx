import { useState, useEffect, useCallback, useRef } from "react";
import {
  useSearchProducts,
  useCreateSalesInvoice,
  useFinalizeSalesInvoice,
  useListCustomers,
  useListCraftsmen,
  useSaveDraft,
  useGetDraft,
  useDeleteDraft,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, Minus, Trash2, ShoppingCart, CheckCircle, X, Package } from "lucide-react";
import { toast } from "sonner";

interface CartItem {
  productId: number;
  productName: string;
  sku: string;
  sellingPrice: number;
  quantity: number;
  discount: number;
  total: number;
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

  const { data: searchResults } = useSearchProducts({ q: searchQuery }, { query: { enabled: searchQuery.length >= 1 } });
  const { data: customersData } = useListCustomers({});
  const { data: craftsmenData } = useListCraftsmen({});
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
        data: JSON.stringify({ cart, customerId, craftsmanId, invoiceDiscount, paymentType, notes }),
      },
    });
  }, [cart, customerId, craftsmanId, invoiceDiscount, paymentType, notes]);

  useEffect(() => {
    const timer = setTimeout(autoSave, 2000);
    return () => clearTimeout(timer);
  }, [autoSave]);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal - invoiceDiscount;

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
        quantity: 1,
        discount: 0,
        total: product.sellingPrice,
      }];
    });
    setSearchQuery("");
  };

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const qty = Math.max(0.5, item.quantity + delta);
      return { ...item, quantity: qty, total: qty * item.sellingPrice - item.discount };
    }));
  };

  const updateDiscount = (idx: number, disc: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return { ...item, discount: disc, total: item.quantity * item.sellingPrice - disc };
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
      toast.success(`تم إنشاء الفاتورة ${inv.serial} بنجاح`);
      setShowFinalizeDialog(false);
      clearCart();
    } catch (e: any) {
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
    setNotes(draftData.notes || "");
    setShowDraftDialog(false);
    toast.success("تم استعادة المسودة");
  };

  const customers = customersData?.items || [];
  const craftsmen = craftsmenData?.items || [];

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
                className="pr-9"
                placeholder="ابحث بالاسم أو الكود أو الباركود..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex-1 overflow-y-auto space-y-2">
          {searchQuery && (searchResults as any[])?.map((p: any) => (
            <Card key={p.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => addToCart(p)}>
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
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="اختر العميل (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">عميل نقدي</SelectItem>
              {customers.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={craftsmanId} onValueChange={setCraftsmanId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="صنايعي (اختياري)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">بدون صنايعي</SelectItem>
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
                  {cart.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/30">
                      <td className="p-3">
                        <p className="font-medium text-sm">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.sku}</p>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(idx, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-10 text-center font-semibold">{item.quantity}</span>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(idx, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="p-3 text-center text-sm">{formatCurrency(item.sellingPrice)}</td>
                      <td className="p-3">
                        <Input
                          type="number"
                          className="h-7 text-xs text-center"
                          value={item.discount || ""}
                          onChange={e => updateDiscount(idx, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </td>
                      <td className="p-3 text-left font-bold text-sm text-primary">{formatCurrency(item.total)}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
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
                  <Input type="number" className="h-7 w-32 text-sm" value={invoiceDiscount || ""} onChange={e => setInvoiceDiscount(parseFloat(e.target.value) || 0)} placeholder="0" />
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
