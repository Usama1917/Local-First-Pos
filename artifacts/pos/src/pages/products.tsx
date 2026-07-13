import { useState } from "react";
import {
  useListProducts,
  useListCategories,
  useListBrands,
  useListSuppliers,
  useListUnits,
  useCreateProduct,
  useUpdateProduct,
  useGetSettings,
  getNextBarcode,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Barcode } from "@/components/ui/barcode";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { printLabels } from "@/lib/print-labels";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, AlertTriangle, Package, Trash2, Pencil, Printer, Ban, RefreshCw, ScanLine } from "lucide-react";
import { toast } from "sonner";

const EMPTY_FORM = {
  nameAr: "", sku: "", barcode: "", barcodeMode: "ready", soldByWeight: false, categoryId: "", brandId: "", supplierId: "", unitId: "",
  listPrice: "", supplierDiscount: "30", netPurchasePrice: "", extraCost: "0",
  trueCost: "", sellingPrice: "", minSellingPrice: "", currentStock: "0", minStock: "5",
  colorCode: "", paintType: "", packageSize: "", isActive: true,
};

// Map an existing product row (numbers) into the string-based form shape.
function productToForm(p: any) {
  const str = (v: any, d = "") => (v == null ? d : String(v));
  return {
    nameAr: p.nameAr ?? "", sku: p.sku ?? "", barcode: p.barcode ?? "", barcodeMode: "ready", soldByWeight: !!p.soldByWeight,
    categoryId: str(p.categoryId), brandId: str(p.brandId), supplierId: str(p.supplierId), unitId: str(p.unitId),
    listPrice: str(p.listPrice), supplierDiscount: str(p.supplierDiscount, "0"), netPurchasePrice: str(p.netPurchasePrice),
    extraCost: str(p.extraCost, "0"), trueCost: str(p.trueCost), sellingPrice: str(p.sellingPrice),
    minSellingPrice: str(p.minSellingPrice), currentStock: str(p.currentStock, "0"), minStock: str(p.minStock, "5"),
    colorCode: p.colorCode ?? "", paintType: p.paintType ?? "", packageSize: p.packageSize ?? "",
    isActive: p.isActive == null ? true : !!p.isActive,
  };
}

// skipEmpty=true (edit): leave empty numeric inputs as undefined so the backend
// COALESCE preserves the existing value instead of overwriting it with 0.
function buildPayload(f: any, skipEmpty = false) {
  const n = (v: any, d: number) => {
    if (skipEmpty && (v === "" || v == null)) return undefined;
    const x = parseFloat(v);
    return Number.isNaN(x) ? (skipEmpty ? undefined : d) : x;
  };
  return {
    ...f,
    soldByWeight: !!f.soldByWeight,
    categoryId: f.categoryId ? Number(f.categoryId) : undefined,
    brandId: f.brandId ? Number(f.brandId) : undefined,
    supplierId: f.supplierId ? Number(f.supplierId) : undefined,
    unitId: f.unitId ? Number(f.unitId) : undefined,
    listPrice: n(f.listPrice, 0),
    supplierDiscount: n(f.supplierDiscount, 0),
    netPurchasePrice: n(f.netPurchasePrice, 0),
    extraCost: n(f.extraCost, 0),
    trueCost: n(f.trueCost, 0),
    sellingPrice: n(f.sellingPrice, 0),
    minSellingPrice: f.minSellingPrice ? parseFloat(f.minSellingPrice) : undefined,
    currentStock: n(f.currentStock, 0),
    minStock: n(f.minStock, 5),
  };
}

/** Shared product fields (identity + pricing + barcode) used by both add & edit dialogs. */
function ProductFormFields({
  form, setForm, lists, scanEnabled, stockEditable = true,
}: {
  form: any; setForm: (updater: any) => void; lists: any; scanEnabled: boolean; stockEditable?: boolean;
}) {
  const { cats, brands, suppliers, units } = lists;
  const [generating, setGenerating] = useState(false);

  const calcPrices = (f: any) => {
    const list = parseFloat(f.listPrice) || 0;
    const disc = parseFloat(f.supplierDiscount) || 0;
    const extra = parseFloat(f.extraCost) || 0;
    const net = list * (1 - disc / 100);
    return { netPurchasePrice: net.toFixed(2), trueCost: (net + extra).toFixed(2) };
  };

  const updateForm = (key: string, val: any) => {
    setForm((prev: any) => {
      const updated = { ...prev, [key]: val };
      if (["listPrice", "supplierDiscount", "extraCost"].includes(key)) Object.assign(updated, calcPrices(updated));
      return updated;
    });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await getNextBarcode();
      setForm((prev: any) => ({ ...prev, barcode: r.barcode }));
    } catch {
      toast.error("تعذّر توليد الباركود");
    } finally {
      setGenerating(false);
    }
  };

  const setMode = (m: string) => {
    setForm((prev: any) => ({ ...prev, barcodeMode: m }));
    if (m === "generate" && !form.barcode) generate();
  };

  // Weight/bulk products are sold by measure and never get a barcode/sticker.
  const setSoldByWeight = (v: boolean) => {
    setForm((prev: any) => ({ ...prev, soldByWeight: v, ...(v ? { barcode: "", barcodeMode: "ready" } : {}) }));
  };

  // Scanner only fills the barcode for count products in "ready" mode.
  useBarcodeScanner(
    (code) => setForm((prev: any) => ({ ...prev, barcode: code })),
    { enabled: scanEnabled && !form.soldByWeight && form.barcodeMode !== "generate" },
  );

  const unitName = (units as any[])?.find((u: any) => String(u.id) === String(form.unitId))?.name;
  // Hint shown next to every price/quantity field: "(بالقطعة)" for count products,
  // "(بالكيلو)" (or the chosen unit) for weight products.
  const unitWord = unitName || (form.soldByWeight ? "كيلو" : "قطعة");
  const perUnitHint = <span className="text-muted-foreground font-normal"> (بال{unitWord})</span>;

  return (
    <div className="space-y-5">
      {/* طريقة البيع: بالقطعة (عدد) أو بالوزن/الكمية */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3">
        <Label className="text-sm">طريقة البيع:</Label>
        <div className="inline-flex rounded-md bg-muted p-0.5 text-sm font-medium">
          <button type="button" onClick={() => setSoldByWeight(false)}
            className={`rounded px-3 py-1 transition-colors ${!form.soldByWeight ? "bg-background shadow" : "text-muted-foreground"}`}>بالقطعة (عدد)</button>
          <button type="button" onClick={() => setSoldByWeight(true)}
            className={`rounded px-3 py-1 transition-colors ${form.soldByWeight ? "bg-background shadow" : "text-muted-foreground"}`}>بالوزن / الكمية</button>
        </div>
        {form.soldByWeight && <span className="text-xs text-muted-foreground">المنتجات بالوزن مش بياخدوا باركود</span>}
      </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-5">
      {/* RIGHT half — بيانات المنتج */}
      <div className="space-y-4">
        <div className="space-y-1"><Label>الاسم بالعربية *</Label><Input value={form.nameAr} onChange={e => updateForm("nameAr", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>كود المنتج (SKU) *</Label><Input value={form.sku} onChange={e => updateForm("sku", e.target.value)} /></div>
          <div className="space-y-1"><Label>التصنيف</Label>
            <Select value={form.categoryId} onValueChange={v => updateForm("categoryId", v)}>
              <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
              <SelectContent>{(cats as any[])?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>الماركة</Label>
            <Select value={form.brandId} onValueChange={v => updateForm("brandId", v)}>
              <SelectTrigger><SelectValue placeholder="اختر الماركة" /></SelectTrigger>
              <SelectContent>{(brands as any[])?.map((b: any) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>المورد</Label>
            <Select value={form.supplierId} onValueChange={v => updateForm("supplierId", v)}>
              <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>{(suppliers as any)?.items?.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label>وحدة القياس</Label>
            <Select value={form.unitId} onValueChange={v => updateForm("unitId", v)}>
              <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
              <SelectContent>{(units as any[])?.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* الباركود — للمنتجات بالقطعة فقط (وضعان: جاهز / إنشاء) */}
        {form.soldByWeight ? (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            منتج بالوزن — مش بياخد باركود ولا ستيكر طباعة.
          </div>
        ) : (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <Label>الباركود</Label>
            <div className="inline-flex rounded-md bg-muted p-0.5 text-xs font-medium">
              <button type="button" onClick={() => setMode("ready")}
                className={`rounded px-2.5 py-1 transition-colors ${form.barcodeMode !== "generate" ? "bg-background shadow" : "text-muted-foreground"}`}>باركود جاهز</button>
              <button type="button" onClick={() => setMode("generate")}
                className={`rounded px-2.5 py-1 transition-colors ${form.barcodeMode === "generate" ? "bg-background shadow" : "text-muted-foreground"}`}>إنشاء باركود</button>
            </div>
          </div>

          {form.barcodeMode === "generate" ? (
            form.barcode ? (
              <div className="flex items-center gap-3">
                <div className="rounded border bg-white p-1.5"><Barcode value={form.barcode} height={34} width={1.4} fontSize={12} /></div>
                <div className="flex-1 text-xs text-muted-foreground">
                  <p>الكود المميز: <span className="font-mono font-semibold text-foreground">{form.sku || "—"}</span></p>
                  <p className="mt-0.5">الرقم: <span className="font-mono">{form.barcode}</span></p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={generate} disabled={generating}>
                  <RefreshCw className="h-3.5 w-3.5 ml-1" />جديد
                </Button>
              </div>
            ) : (
              <Button type="button" variant="secondary" onClick={generate} disabled={generating}>
                {generating ? "جاري التوليد..." : "توليد باركود"}
              </Button>
            )
          ) : (
            <div className="space-y-1.5">
              <Input value={form.barcode} onChange={e => updateForm("barcode", e.target.value)} placeholder="اكتب الباركود أو اعمل سكان" />
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><ScanLine className="h-3.5 w-3.5" /> اعمل سكان للباركود وهيتكتب تلقائي</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* LEFT half — حسبة الأسعار */}
      <div className="space-y-4 lg:border-r lg:pr-10">
        <p className="text-sm font-semibold text-muted-foreground">حسبة الأسعار</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1"><Label>السعر القائمة{perUnitHint}</Label><Input type="number" value={form.listPrice} onChange={e => updateForm("listPrice", e.target.value)} /></div>
          <div className="space-y-1"><Label>خصم المورد %</Label><Input type="number" value={form.supplierDiscount} onChange={e => updateForm("supplierDiscount", e.target.value)} /></div>
          <div className="space-y-1"><Label>صافي شراء{perUnitHint}</Label><Input type="number" value={form.netPurchasePrice} readOnly className="bg-muted" /></div>
          <div className="space-y-1"><Label>تكاليف إضافية{perUnitHint}</Label><Input type="number" value={form.extraCost} onChange={e => updateForm("extraCost", e.target.value)} /></div>
          <div className="space-y-1"><Label>التكلفة الحقيقية{perUnitHint}</Label><Input type="number" value={form.trueCost} readOnly className="bg-muted" /></div>
          <div className="space-y-1"><Label>سعر البيع *{perUnitHint}</Label><Input type="number" value={form.sellingPrice} onChange={e => updateForm("sellingPrice", e.target.value)} /></div>
          <div className="space-y-1"><Label>أقل سعر بيع{perUnitHint}</Label><Input type="number" value={form.minSellingPrice} onChange={e => updateForm("minSellingPrice", e.target.value)} /></div>
          <div className="space-y-1"><Label>{form.soldByWeight ? "الكمية" : "العدد"}{perUnitHint}</Label>
            <Input type="number" value={form.currentStock} readOnly={!stockEditable} className={stockEditable ? "" : "bg-muted"} onChange={e => updateForm("currentStock", e.target.value)} />
            {!stockEditable && <p className="text-[10px] text-muted-foreground">تتعدّل من المخزن/الجرد</p>}
          </div>
          <div className="space-y-1"><Label>حد النفاد{perUnitHint}</Label><Input type="number" value={form.minStock} onChange={e => updateForm("minStock", e.target.value)} /></div>
        </div>
        {form.trueCost && form.sellingPrice && (
          <div className="bg-muted/50 p-3 rounded text-sm">
            هامش الربح: <strong>{(((parseFloat(form.sellingPrice) - parseFloat(form.trueCost)) / parseFloat(form.sellingPrice)) * 100).toFixed(1)}%</strong>
            {" "}| ربح الوحدة: <strong>{formatCurrency(parseFloat(form.sellingPrice) - parseFloat(form.trueCost))}</strong>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [queue, setQueue] = useState<any[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>(EMPTY_FORM);

  const qc = useQueryClient();
  const params = {
    search: search || undefined,
    categoryId: categoryFilter ? Number(categoryFilter) : undefined,
    lowStock: lowStockFilter || undefined,
    isActive: true,
    limit: 100,
  };
  const { data, isLoading } = useListProducts(params, { query: { queryKey: getListProductsQueryKey(params) } });
  const { data: cats } = useListCategories({});
  const { data: brands } = useListBrands({});
  const { data: suppliers } = useListSuppliers({});
  const { data: units } = useListUnits({});
  const { data: settings } = useGetSettings();
  const shopName = (settings as any)?.shopName as string | undefined;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const lists = { cats, brands, suppliers, units };

  // add the current form entry to the batch list (does NOT save yet)
  const addToQueue = () => {
    if (!form.nameAr || !form.sku) { toast.error("الاسم والكود مطلوبان"); return; }
    if (queue.some((q) => q.sku === form.sku)) { toast.error("الكود مكرر في القائمة"); return; }
    if (form.barcode && queue.some((q) => q.barcode === form.barcode)) { toast.error("الباركود مكرر في القائمة"); return; }
    setQueue((prev) => [...prev, { ...form, print: true }]);
    setForm(EMPTY_FORM);
    toast.success("تمت الإضافة للقائمة");
  };

  const removeFromQueue = (idx: number) => setQueue((prev) => prev.filter((_, i) => i !== idx));
  const togglePrint = (idx: number) => setQueue((prev) => prev.map((q, i) => (i === idx ? { ...q, print: !q.print } : q)));

  // pull a queued row back into the form to edit it
  const editFromQueue = (idx: number) => {
    setForm(queue[idx]);
    removeFromQueue(idx);
  };

  // save every product in the batch, then print stickers for the printable ones
  const handleSubmit = async () => {
    const items = [...queue];
    if (form.nameAr && form.sku && !items.some((i) => i.sku === form.sku)) items.push({ ...form, print: true });
    if (items.length === 0) { toast.error("أضف منتج واحد على الأقل"); return; }
    // Save sequentially; track what saved so a mid-batch failure doesn't leave the
    // already-saved rows in the queue (which would double-save on retry).
    const saved = new Set<string>();
    try {
      for (const it of items) {
        await createProduct.mutateAsync({ data: buildPayload(it) });
        saved.add(it.sku);
      }
    } catch (e: any) {
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      setQueue((prev) => prev.filter((q) => !saved.has(q.sku)));
      if (saved.has(form.sku)) setForm(EMPTY_FORM);
      toast.error(e.message || "خطأ — اتحفظ بعض المنتجات بس");
      return;
    }
    qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
    const labels = items
      .filter((it) => it.print !== false)
      .map((it) => ({ barcode: it.barcode, sku: it.sku, copies: Math.round(parseFloat(it.currentStock) || 0) }))
      .filter((l) => l.barcode && l.copies >= 1);
    toast.success(`تم إضافة ${items.length} منتج`);
    setShowAddDialog(false);
    setQueue([]);
    setForm(EMPTY_FORM);
    if (labels.length && !printLabels(labels, shopName)) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
  };

  const openEdit = (p: any) => { setEditForm(productToForm(p)); setEditId(p.id); };

  const handleUpdate = async () => {
    if (!editForm.nameAr || !editForm.sku) { toast.error("الاسم والكود مطلوبان"); return; }
    try {
      await updateProduct.mutateAsync({ id: editId as number, data: buildPayload(editForm, true) });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      toast.success("تم حفظ التعديلات");
      setEditId(null);
    } catch (e: any) {
      toast.error(e.message || "خطأ");
    }
  };

  const pendingCount = queue.length + (form.nameAr && form.sku && !queue.some((q) => q.sku === form.sku) ? 1 : 0);
  const products = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      {/* ===== Add (batch) dialog ===== */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[1340px] w-[96vw] max-h-[94vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة منتج جديد</DialogTitle></DialogHeader>

          <ProductFormFields form={form} setForm={setForm} lists={lists} scanEnabled={showAddDialog} />

          <Button type="button" variant="secondary" className="w-full" onClick={addToQueue}>
            <Plus className="h-4 w-4 ml-2" />إضافة المنتج للقائمة
          </Button>

          {/* batch sheet */}
          <div className="border-t pt-4 mt-2 space-y-2">
            <p className="text-sm font-semibold">
              المنتجات في هذه الدفعة <Badge variant="secondary" className="ms-1">{queue.length}</Badge>
            </p>
            <div className="border rounded-md max-h-[30vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-right">
                    <th className="p-2">المنتج</th>
                    <th className="p-2">الباركود</th>
                    <th className="p-2 text-left">سعر البيع</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">ستيكر</th>
                    <th className="p-2 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((q, i) => {
                    const copies = Math.round(parseFloat(q.currentStock) || 0);
                    const willPrint = q.print !== false && q.barcode && copies >= 1;
                    return (
                      <tr key={i} className={`border-b hover:bg-muted/30 ${q.print === false ? "opacity-50" : ""}`}>
                        <td className="p-2 font-medium">{q.nameAr}</td>
                        <td className="p-2 font-mono text-xs">{q.barcode || <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2 text-left">{formatCurrency(parseFloat(q.sellingPrice) || 0)}</td>
                        <td className="p-2 text-center">{copies}</td>
                        <td className="p-2 text-center">{willPrint ? <span className="font-semibold">{copies}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-2">
                          <div className="flex gap-1 justify-end">
                            {q.barcode && (
                              <Button size="icon" variant="ghost" className={`h-8 w-8 ${q.print === false ? "text-muted-foreground" : "text-emerald-600"}`} onClick={() => togglePrint(i)} title={q.print === false ? "تشغيل الطباعة" : "عدم الطباعة"}>
                                {q.print === false ? <Ban className="h-4 w-4" /> : <Printer className="h-4 w-4" />}
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => editFromQueue(i)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeFromQueue(i)} title="حذف"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {queue.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">
                      لسه مفيش منتجات في الدفعة — املأ البيانات فوق واضغط "إضافة المنتج للقائمة"
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={createProduct.isPending || pendingCount === 0}>
              <Printer className="h-4 w-4 ml-2" />
              {createProduct.isPending ? "جاري الحفظ..." : `حفظ الكل وطباعة (${pendingCount})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Edit dialog ===== */}
      <Dialog open={editId !== null} onOpenChange={(o) => !o && setEditId(null)}>
        <DialogContent className="max-w-[1180px] w-[95vw] max-h-[94vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل المنتج</DialogTitle></DialogHeader>
          <ProductFormFields form={editForm} setForm={setEditForm} lists={lists} scanEnabled={editId !== null} stockEditable={false} />
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditId(null)}>إلغاء</Button>
            <Button onClick={handleUpdate} disabled={updateProduct.isPending}>
              {updateProduct.isPending ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 ml-2" />
          منتج جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="بحث بالاسم أو الكود..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={categoryFilter || "__none__"} onValueChange={(v) => setCategoryFilter(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="كل التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">كل التصنيفات</SelectItem>
                {(cats as any[])?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={lowStockFilter ? "destructive" : "outline"} onClick={() => setLowStockFilter(v => !v)}>
              <AlertTriangle className="h-4 w-4 ml-1" />
              نواقص
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div> : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3">المنتج</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3">الكود</th>
                  <th className="p-3 text-center">المخزون</th>
                  <th className="p-3 text-left">سعر البيع</th>
                  <th className="p-3 text-left">التكلفة</th>
                  <th className="p-3 text-left">هامش %</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p: any) => {
                  const margin = p.sellingPrice && p.trueCost ? ((p.sellingPrice - p.trueCost) / p.sellingPrice * 100).toFixed(1) : "—";
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(p)}>
                      <td className="p-3">
                        <p className="font-medium">{p.nameAr}</p>
                        {p.brandName && <p className="text-xs text-muted-foreground">{p.brandName}</p>}
                      </td>
                      <td className="p-3 text-muted-foreground">{p.categoryName || "—"}</td>
                      <td className="p-3 font-mono text-xs">{p.sku}</td>
                      <td className="p-3 text-center">
                        <span className={`font-bold ${p.isLowStock ? "text-destructive" : "text-foreground"}`}>
                          {p.currentStock}
                        </span>
                        {p.isLowStock && <AlertTriangle className="h-3 w-3 text-destructive inline mr-1" />}
                      </td>
                      <td className="p-3 text-left font-semibold">{formatCurrency(p.sellingPrice)}</td>
                      <td className="p-3 text-left text-muted-foreground">{formatCurrency(p.trueCost)}</td>
                      <td className="p-3 text-left">
                        <Badge variant={parseFloat(margin) > 20 ? "default" : "secondary"}>{margin}%</Badge>
                      </td>
                      <td className="p-3 text-left">
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                    <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    لا توجد منتجات
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
