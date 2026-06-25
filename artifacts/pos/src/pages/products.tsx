import { useState } from "react";
import {
  useListProducts,
  useListCategories,
  useListBrands,
  useListSuppliers,
  useListUnits,
  useCreateProduct,
  useGetProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState<any>({
    nameAr: "", sku: "", barcode: "", categoryId: "", brandId: "", supplierId: "", unitId: "",
    listPrice: "", supplierDiscount: "30", netPurchasePrice: "", extraCost: "0",
    trueCost: "", sellingPrice: "", minSellingPrice: "", currentStock: "0", minStock: "5",
    colorCode: "", paintType: "", packageSize: "", isActive: true,
  });

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
  const createProduct = useCreateProduct();

  const calcPrices = (f: any) => {
    const list = parseFloat(f.listPrice) || 0;
    const disc = parseFloat(f.supplierDiscount) || 0;
    const extra = parseFloat(f.extraCost) || 0;
    const net = list * (1 - disc / 100);
    const trueCost = net + extra;
    return { netPurchasePrice: net.toFixed(2), trueCost: trueCost.toFixed(2) };
  };

  const updateForm = (key: string, val: any) => {
    const updated = { ...form, [key]: val };
    if (["listPrice", "supplierDiscount", "extraCost"].includes(key)) {
      const calc = calcPrices(updated);
      Object.assign(updated, calc);
    }
    setForm(updated);
  };

  const handleSubmit = async () => {
    if (!form.nameAr || !form.sku) { toast.error("الاسم والكود مطلوبان"); return; }
    try {
      await createProduct.mutateAsync({
        data: {
          ...form,
          categoryId: form.categoryId ? Number(form.categoryId) : undefined,
          brandId: form.brandId ? Number(form.brandId) : undefined,
          supplierId: form.supplierId ? Number(form.supplierId) : undefined,
          unitId: form.unitId ? Number(form.unitId) : undefined,
          listPrice: parseFloat(form.listPrice) || 0,
          supplierDiscount: parseFloat(form.supplierDiscount) || 0,
          netPurchasePrice: parseFloat(form.netPurchasePrice) || 0,
          extraCost: parseFloat(form.extraCost) || 0,
          trueCost: parseFloat(form.trueCost) || 0,
          sellingPrice: parseFloat(form.sellingPrice) || 0,
          minSellingPrice: form.minSellingPrice ? parseFloat(form.minSellingPrice) : undefined,
          currentStock: parseFloat(form.currentStock) || 0,
          minStock: parseFloat(form.minStock) || 5,
        },
      });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
      toast.success("تم إضافة المنتج");
      setShowAddDialog(false);
      setForm({ nameAr: "", sku: "", barcode: "", categoryId: "", brandId: "", supplierId: "", unitId: "", listPrice: "", supplierDiscount: "30", netPurchasePrice: "", extraCost: "0", trueCost: "", sellingPrice: "", minSellingPrice: "", currentStock: "0", minStock: "5", colorCode: "", paintType: "", packageSize: "", isActive: true });
    } catch (e: any) {
      toast.error(e.message || "خطأ");
    }
  };

  const products = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة منتج جديد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1"><Label>الاسم بالعربية *</Label><Input value={form.nameAr} onChange={e => updateForm("nameAr", e.target.value)} /></div>
            <div className="space-y-1"><Label>الاسم بالإنجليزية</Label><Input value={form.nameEn} onChange={e => updateForm("nameEn", e.target.value)} /></div>
            <div className="space-y-1"><Label>كود المنتج (SKU) *</Label><Input value={form.sku} onChange={e => updateForm("sku", e.target.value)} /></div>
            <div className="space-y-1"><Label>الباركود</Label><Input value={form.barcode} onChange={e => updateForm("barcode", e.target.value)} /></div>
            <div className="space-y-1"><Label>التصنيف</Label>
              <Select value={form.categoryId} onValueChange={v => updateForm("categoryId", v)}>
                <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                <SelectContent>{(cats as any[])?.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
            <div className="space-y-1"><Label>وحدة القياس</Label>
              <Select value={form.unitId} onValueChange={v => updateForm("unitId", v)}>
                <SelectTrigger><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                <SelectContent>{(units as any[])?.map((u: any) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="col-span-2 border-t pt-3">
              <p className="text-sm font-semibold mb-3 text-muted-foreground">حسبة الأسعار</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label>السعر القائمة</Label><Input type="number" value={form.listPrice} onChange={e => updateForm("listPrice", e.target.value)} /></div>
                <div className="space-y-1"><Label>خصم المورد %</Label><Input type="number" value={form.supplierDiscount} onChange={e => updateForm("supplierDiscount", e.target.value)} /></div>
                <div className="space-y-1"><Label>صافي شراء</Label><Input type="number" value={form.netPurchasePrice} readOnly className="bg-muted" /></div>
                <div className="space-y-1"><Label>تكاليف إضافية</Label><Input type="number" value={form.extraCost} onChange={e => updateForm("extraCost", e.target.value)} /></div>
                <div className="space-y-1"><Label>التكلفة الحقيقية</Label><Input type="number" value={form.trueCost} readOnly className="bg-muted" /></div>
                <div className="space-y-1"><Label>سعر البيع *</Label><Input type="number" value={form.sellingPrice} onChange={e => updateForm("sellingPrice", e.target.value)} /></div>
                <div className="space-y-1"><Label>أقل سعر بيع</Label><Input type="number" value={form.minSellingPrice} onChange={e => updateForm("minSellingPrice", e.target.value)} /></div>
                <div className="space-y-1"><Label>الرصيد الافتتاحي</Label><Input type="number" value={form.currentStock} onChange={e => updateForm("currentStock", e.target.value)} /></div>
                <div className="space-y-1"><Label>حد النفاد</Label><Input type="number" value={form.minStock} onChange={e => updateForm("minStock", e.target.value)} /></div>
              </div>
            </div>
            {form.trueCost && form.sellingPrice && (
              <div className="col-span-2 bg-muted/50 p-3 rounded text-sm">
                هامش الربح: <strong>{(((parseFloat(form.sellingPrice) - parseFloat(form.trueCost)) / parseFloat(form.sellingPrice)) * 100).toFixed(1)}%</strong>
                {" "}| ربح الوحدة: <strong>{formatCurrency(parseFloat(form.sellingPrice) - parseFloat(form.trueCost))}</strong>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button>
            <Button onClick={handleSubmit} disabled={createProduct.isPending}>
              {createProduct.isPending ? "جاري الحفظ..." : "حفظ المنتج"}
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
                </tr>
              </thead>
              <tbody>
                {products.map((p: any) => {
                  const margin = p.sellingPrice && p.trueCost ? ((p.sellingPrice - p.trueCost) / p.sellingPrice * 100).toFixed(1) : "—";
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
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
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
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
