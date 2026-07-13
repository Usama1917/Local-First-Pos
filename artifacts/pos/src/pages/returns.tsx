import { useState } from "react";
import {
  useCreateReturn,
  useListReturns,
  lookupInvoiceForReturn,
  getReturn,
  useSearchProducts,
  useGetSettings,
  getSearchProductsQueryKey,
  getListReturnsQueryKey,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { printReturnReceipt } from "@/lib/print-return";
import { normalizeFormat } from "@/lib/print-document";
import { AuditInfo } from "@/components/ui/audit-info";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { Search, RotateCcw, Repeat, Printer, Plus, Trash2, Undo2, PackageX } from "lucide-react";
import { toast } from "sonner";

export default function ReturnsPage() {
  const qc = useQueryClient();
  const [serial, setSerial] = useState("");
  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // per-line return state, keyed by productId
  const [retQty, setRetQty] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  // exchange (new) items
  const [newItems, setNewItems] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [settlement, setSettlement] = useState<"cash" | "account">("cash");
  const [notes, setNotes] = useState("");

  const createReturn = useCreateReturn();
  const { data: settings } = useGetSettings();
  const shop = (settings as any) || {};
  const { data: searchResults } = useSearchProducts(
    { q: productSearch },
    { query: { enabled: productSearch.length >= 1, queryKey: getSearchProductsQueryKey({ q: productSearch }) } },
  );
  const histParams = { limit: 50 };
  const { data: history } = useListReturns(histParams, { query: { queryKey: getListReturnsQueryKey(histParams) } });
  const returns = (history as any)?.items || [];

  const resetAll = () => {
    setInvoice(null); setSerial(""); setRetQty({}); setRestock({}); setNewItems([]); setNotes(""); setSettlement("cash");
  };

  const lookup = async (code?: string) => {
    const s = (code ?? serial).trim();
    if (!s) return;
    setLoading(true);
    try {
      const inv = await lookupInvoiceForReturn(s);
      setInvoice(inv);
      setSerial((inv as any).serial);
      setRetQty({}); setRestock({}); setNewItems([]); setNotes("");
      setSettlement("cash");
    } catch (e: any) {
      setInvoice(null);
      toast.error(e?.message || "الفاتورة غير موجودة");
    } finally {
      setLoading(false);
    }
  };

  // Hardware scanner: only active until an invoice is loaded → scans the invoice.
  useBarcodeScanner((code) => { setSerial(code); lookup(code); }, { enabled: !invoice });

  const addNewItem = (p: any) => {
    setNewItems((prev) => {
      if (prev.find((i) => i.productId === p.id)) return prev;
      return [...prev, { productId: p.id, productName: p.nameAr, sku: p.sku, quantity: 1, unitPrice: p.sellingPrice || 0 }];
    });
    setProductSearch("");
  };
  const updateNewItem = (idx: number, key: string, val: number) =>
    setNewItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  const removeNewItem = (idx: number) => setNewItems((prev) => prev.filter((_, i) => i !== idx));

  const items = invoice?.items || [];
  const returnedTotal = items.reduce(
    (s: number, it: any) => s + (parseFloat(retQty[it.productId]) || 0) * it.unitPrice, 0);
  const newItemsTotal = newItems.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0);
  const net = Math.round((newItemsTotal - returnedTotal) * 100) / 100;
  const hasSelection = returnedTotal > 0 || newItems.some((i) => i.quantity > 0);
  const isExchange = newItems.length > 0;

  const setQty = (it: any, raw: string) => {
    const v = Math.max(0, Math.min(parseFloat(raw) || 0, it.availableQty));
    setRetQty((prev) => ({ ...prev, [it.productId]: String(v) }));
  };

  const handleSubmit = async () => {
    if (!invoice) return;
    if (!hasSelection) { toast.error("اختر صنفًا للمرتجع أو الاستبدال"); return; }
    if (settlement === "account" && !invoice.customerId) { toast.error("التسوية على الحساب تحتاج فاتورة باسم عميل"); return; }
    const returnedItems = items
      .filter((it: any) => (parseFloat(retQty[it.productId]) || 0) > 0)
      .map((it: any) => ({
        productId: it.productId,
        quantity: parseFloat(retQty[it.productId]),
        unitPrice: it.unitPrice,
        restock: restock[it.productId] !== false,
      }));
    const exchangeItems = newItems
      .filter((n) => n.quantity > 0)
      .map((n) => ({ productId: n.productId, quantity: n.quantity, unitPrice: n.unitPrice }));
    try {
      const receipt = await createReturn.mutateAsync({
        data: { originalInvoiceId: invoice.id, settlementType: settlement, notes: notes || undefined, returnedItems, newItems: exchangeItems },
      });
      qc.invalidateQueries({ queryKey: getListReturnsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getListCustomersQueryKey({}) });
      toast.success(isExchange ? "تم تسجيل الاستبدال" : "تم تسجيل المرتجع");
      if (!printReturnReceipt(receipt as any, shop, normalizeFormat(shop.defaultPrintTemplate))) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
      resetAll();
    } catch (e: any) { toast.error(e?.message || "خطأ"); }
  };

  const reprint = async (id: number) => {
    try {
      const receipt = await getReturn(id);
      if (!printReturnReceipt(receipt as any, shop, normalizeFormat(shop.defaultPrintTemplate))) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
    } catch (e: any) { toast.error(e?.message || "خطأ"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المرتجعات والاستبدال</h1>
        {invoice && <Button variant="outline" onClick={resetAll}><Undo2 className="h-4 w-4 ml-2" />فاتورة جديدة</Button>}
      </div>

      {/* Invoice lookup */}
      <Card><CardContent className="p-4">
        <Label className="mb-1 block">رقم الفاتورة (أو اعمل سكان)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pr-9"
              placeholder="مثال: INV-2026-000003"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
            />
          </div>
          <Button onClick={() => lookup()} disabled={loading}>{loading ? "جاري البحث..." : "عرض الفاتورة"}</Button>
        </div>
      </CardContent></Card>

      {invoice && (
        <>
          {/* Invoice header */}
          <Card><CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-mono font-semibold text-primary">{invoice.serial}</span>
            <span><span className="text-muted-foreground">العميل: </span>{invoice.customerName || "نقدي"}</span>
            <span><span className="text-muted-foreground">التاريخ: </span>{new Date(invoice.createdAt).toLocaleDateString("ar-EG")}</span>
            <span><span className="text-muted-foreground">إجمالي الفاتورة: </span><span className="font-semibold">{formatCurrency(invoice.total)}</span></span>
          </CardContent></Card>

          {/* Returnable items */}
          <Card><CardContent className="p-0">
            <div className="p-3 border-b font-semibold flex items-center gap-2"><RotateCcw className="h-4 w-4" />أصناف الفاتورة — اختر الكمية المرتجعة لكل صنف</div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-2">الصنف</th>
                  <th className="p-2 text-center">المشترى</th>
                  <th className="p-2 text-center">سبق إرجاعه</th>
                  <th className="p-2 text-center">المتاح</th>
                  <th className="p-2 text-left">سعر الوحدة</th>
                  <th className="p-2 text-center w-24">كمية الإرجاع</th>
                  <th className="p-2 text-center w-28">الحالة</th>
                  <th className="p-2 text-left">قيمة المرتجع</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it: any) => {
                  const q = parseFloat(retQty[it.productId]) || 0;
                  const rs = restock[it.productId] !== false;
                  const disabled = it.availableQty <= 0;
                  return (
                    <tr key={it.productId} className={`border-b ${disabled ? "opacity-50" : ""}`}>
                      <td className="p-2 font-medium">{it.productName} {it.sku && <span className="text-xs text-muted-foreground">({it.sku})</span>}</td>
                      <td className="p-2 text-center">{it.quantity}</td>
                      <td className="p-2 text-center text-muted-foreground">{it.returnedQty || 0}</td>
                      <td className="p-2 text-center font-semibold">{it.availableQty}</td>
                      <td className="p-2 text-left">{formatCurrency(it.unitPrice)}</td>
                      <td className="p-2">
                        <Input
                          type="number" min={0} max={it.availableQty} disabled={disabled}
                          className="h-8 text-center"
                          value={retQty[it.productId] ?? ""}
                          placeholder="0"
                          onChange={(e) => setQty(it, e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center">
                        {q > 0 ? (
                          <button
                            type="button"
                            onClick={() => setRestock((p) => ({ ...p, [it.productId]: !rs }))}
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${rs ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400" : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400"}`}
                          >
                            {rs ? <><RotateCcw className="h-3 w-3" />سليم (للمخزن)</> : <><PackageX className="h-3 w-3" />تالف</>}
                          </button>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-2 text-left font-semibold">{q > 0 ? formatCurrency(q * it.unitPrice) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent></Card>

          {/* Exchange: new items */}
          <Card><CardContent className="p-4 space-y-3">
            <div className="font-semibold flex items-center gap-2"><Repeat className="h-4 w-4" />استبدال — أضف الأصناف البديلة (اختياري)</div>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input className="pr-9" placeholder="ابحث عن منتج بديل لإضافته..." value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
              {productSearch && (searchResults as any[])?.length > 0 && (
                <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
                  {(searchResults as any[]).map((p: any) => (
                    <div key={p.id} className="flex justify-between gap-2 p-2 cursor-pointer hover:bg-muted border-b last:border-b-0" onClick={() => addNewItem(p)}>
                      <span>{p.nameAr} <span className="text-xs text-muted-foreground">({p.sku})</span></span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">سعر: {formatCurrency(p.sellingPrice)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {newItems.length > 0 && (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-2">الصنف</th>
                    <th className="p-2 text-center w-24">الكمية</th>
                    <th className="p-2 text-left w-28">سعر الوحدة</th>
                    <th className="p-2 text-left">الإجمالي</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {newItems.map((it, idx) => (
                    <tr key={it.productId} className="border-b">
                      <td className="p-2 font-medium">{it.productName}</td>
                      <td className="p-2"><Input type="number" min={1} className="h-8 text-center" value={it.quantity} onChange={(e) => updateNewItem(idx, "quantity", parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-2"><Input type="number" className="h-8" value={it.unitPrice} onChange={(e) => updateNewItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} /></td>
                      <td className="p-2 text-left font-semibold">{formatCurrency((it.quantity || 0) * (it.unitPrice || 0))}</td>
                      <td className="p-2"><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeNewItem(idx)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent></Card>

          {/* Summary + settlement */}
          <Card><CardContent className="p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">إجمالي المرتجع</span><span className="font-semibold">{formatCurrency(returnedTotal)}</span></div>
                {isExchange && <div className="flex justify-between"><span className="text-muted-foreground">إجمالي البديل</span><span className="font-semibold">{formatCurrency(newItemsTotal)}</span></div>}
                <div className="flex justify-between border-t pt-2 mt-1 text-base font-bold">
                  {net > 0
                    ? <><span className="text-red-600 dark:text-red-400">مطلوب من العميل</span><span className="text-red-600 dark:text-red-400">{formatCurrency(net)}</span></>
                    : net < 0
                      ? <><span className="text-emerald-700 dark:text-emerald-400">مسترد للعميل</span><span className="text-emerald-700 dark:text-emerald-400">{formatCurrency(Math.abs(net))}</span></>
                      : <><span>لا يوجد فرق</span><span>{formatCurrency(0)}</span></>}
                </div>
              </div>
              <div className="space-y-2">
                <Label>طريقة التسوية</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={settlement === "cash" ? "default" : "outline"} className="flex-1" onClick={() => setSettlement("cash")}>كاش</Button>
                  <Button type="button" variant={settlement === "account" ? "default" : "outline"} className="flex-1" onClick={() => setSettlement("account")} disabled={!invoice.customerId} title={!invoice.customerId ? "الفاتورة نقدية — مفيش عميل مسجّل" : ""}>على الحساب</Button>
                </div>
                {settlement === "account" && !invoice.customerId && <p className="text-xs text-red-600 dark:text-red-400">الفاتورة دي نقدية، التسوية على الحساب محتاجة عميل مسجّل.</p>}
                <Input placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetAll}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={!hasSelection || createReturn.isPending}>
                <Printer className="h-4 w-4 ml-2" />
                {isExchange ? "تأكيد الاستبدال وطباعة الإيصال" : "تأكيد المرتجع وطباعة الإيصال"}
              </Button>
            </div>
          </CardContent></Card>
        </>
      )}

      {/* History */}
      <Card><CardContent className="p-0">
        <div className="p-3 border-b font-semibold">آخر المرتجعات والاستبدالات</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الإيصال</th>
              <th className="p-3">النوع</th>
              <th className="p-3">الفاتورة الأصلية</th>
              <th className="p-3">العميل</th>
              <th className="p-3 text-left">الصافي</th>
              <th className="p-3">التسوية</th>
              <th className="p-3">التاريخ</th>
              <th className="p-3 text-center w-20">طباعة</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="p-3 font-mono font-medium text-primary">{r.serial}</td>
                <td className="p-3"><Badge variant={r.type === "exchange" ? "default" : "secondary"}>{r.type === "exchange" ? "استبدال" : "مرتجع"}</Badge></td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{r.originalSerial || "—"}</td>
                <td className="p-3">{r.customerName || "نقدي"}</td>
                <td className="p-3 text-left font-semibold">
                  {r.netAmount > 0
                    ? <span className="text-red-600 dark:text-red-400">{formatCurrency(r.netAmount)}</span>
                    : r.netAmount < 0
                      ? <span className="text-emerald-700 dark:text-emerald-400">-{formatCurrency(Math.abs(r.netAmount))}</span>
                      : formatCurrency(0)}
                </td>
                <td className="p-3 text-xs">{r.settlementType === "account" ? "على الحساب" : "كاش"}</td>
                <td className="p-3 text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleDateString("ar-EG")}</td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => reprint(r.id)} title="إعادة طباعة الإيصال"><Printer className="h-4 w-4" /></Button>
                    <AuditInfo createdBy={r.createdBy} createdAt={r.createdAt} />
                  </div>
                </td>
              </tr>
            ))}
            {returns.length === 0 && (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                <RotateCcw className="h-10 w-10 mx-auto mb-2 opacity-30" />لا توجد مرتجعات بعد
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
