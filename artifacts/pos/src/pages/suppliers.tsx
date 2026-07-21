import { useState } from "react";
import {
  useListSuppliers,
  useCreateSupplier,
  useDeleteSupplier,
  useGetSupplier,
  useGetSupplierPayments,
  useAddSupplierPayment,
  useListBrands,
  useCreateBrand,
  useUpdateBrand,
  useDeleteBrand,
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useListUnits,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  getListSuppliersQueryKey,
  getGetSupplierQueryKey,
  getGetSupplierPaymentsQueryKey,
  getListBrandsQueryKey,
  getListCategoriesQueryKey,
  getListUnitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteButton } from "@/components/ui/delete-confirm";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { Search, Plus, Truck, Eye, CreditCard, Tag, Pencil, Trash2, Layers, Ruler, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

function SupplierProfile({ id }: { id: number }) {
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const qc = useQueryClient();
  const { data: supplier } = useGetSupplier(id, { query: { queryKey: getGetSupplierQueryKey(id) } });
  const { data: payments } = useGetSupplierPayments(id, { query: { queryKey: getGetSupplierPaymentsQueryKey(id) } });
  const addPayment = useAddSupplierPayment();
  const s = supplier as any;
  if (!s) return null;

  const handlePay = async () => {
    if (!payAmount) { toast.error("أدخل المبلغ"); return; }
    await addPayment.mutateAsync({ id, data: { amount: parseFloat(payAmount), date: new Date().toISOString().split("T")[0], notes: payNote } });
    qc.invalidateQueries({ queryKey: getGetSupplierPaymentsQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey({}) });
    toast.success("تم تسجيل الدفعة");
    setPayAmount(""); setPayNote("");
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>{s.name}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-destructive">{formatCurrency(s.totalDebt)}</p>
          <p className="text-xs text-muted-foreground">المستحق للمورد</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-sm font-medium">{s.phone || "—"}</p>
          <p className="text-xs text-muted-foreground">{s.contactPerson || ""}</p>
        </CardContent></Card>
      </div>
      <div className="flex gap-2 p-3 bg-muted/50 rounded-lg mb-3">
        <Input type="number" placeholder="المبلغ" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-32" />
        <Input placeholder="ملاحظات" value={payNote} onChange={e => setPayNote(e.target.value)} className="flex-1" />
        <Button onClick={handlePay} disabled={addPayment.isPending}>
          <CreditCard className="h-4 w-4 ml-2" />
          سداد
        </Button>
      </div>
      <h3 className="font-semibold mb-2">الدفعات</h3>
      <table className="w-full text-sm">
        <thead className="bg-muted/50"><tr>
          <th className="p-2 text-right">التاريخ</th>
          <th className="p-2 text-left">المبلغ</th>
          <th className="p-2 text-right">ملاحظات</th>
        </tr></thead>
        <tbody>
          {(payments as any[])?.map((p: any) => (
            <tr key={p.id} className="border-b">
              <td className="p-2">{new Date(p.date).toLocaleDateString("ar-EG")}</td>
              <td className="p-2 text-left text-emerald-600 dark:text-emerald-400 font-semibold">{formatCurrency(p.amount)}</td>
              <td className="p-2 text-muted-foreground">{p.notes || "—"}</td>
            </tr>
          ))}
          {!(payments as any[])?.length && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">لا توجد دفعات</td></tr>}
        </tbody>
      </table>
    </DialogContent>
  );
}

export default function SuppliersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الموردين والماركات</h1>
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers"><Truck className="h-4 w-4 ml-2" />الموردين</TabsTrigger>
          <TabsTrigger value="categories"><Layers className="h-4 w-4 ml-2" />التصنيفات</TabsTrigger>
          <TabsTrigger value="brands"><Tag className="h-4 w-4 ml-2" />الماركات</TabsTrigger>
          <TabsTrigger value="units"><Ruler className="h-4 w-4 ml-2" />وحدات القياس</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers"><SuppliersTab /></TabsContent>
        <TabsContent value="categories">
          <AttributeTab
            singular="التصنيف"
            addLabel="إضافة تصنيف"
            emptyLabel="لا توجد تصنيفات"
            headerLabel="التصنيف"
            Icon={Layers}
            entity="categories"
            showCount
            useList={useListCategories}
            useCreate={useCreateCategory}
            useUpdate={useUpdateCategory}
            useDelete={useDeleteCategory}
            getQueryKey={getListCategoriesQueryKey}
          />
        </TabsContent>
        <TabsContent value="brands">
          <AttributeTab
            singular="الماركة"
            addLabel="إضافة ماركة"
            emptyLabel="لا توجد ماركات"
            headerLabel="الماركة"
            Icon={Tag}
            entity="brands"
            useList={useListBrands}
            useCreate={useCreateBrand}
            useUpdate={useUpdateBrand}
            useDelete={useDeleteBrand}
            getQueryKey={getListBrandsQueryKey}
          />
        </TabsContent>
        <TabsContent value="units">
          <AttributeTab
            singular="الوحدة"
            addLabel="إضافة وحدة"
            emptyLabel="لا توجد وحدات قياس"
            headerLabel="الوحدة"
            Icon={Ruler}
            entity="units"
            useList={useListUnits}
            useCreate={useCreateUnit}
            useUpdate={useUpdateUnit}
            useDelete={useDeleteUnit}
            getQueryKey={getListUnitsQueryKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SuppliersTab() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", contactPerson: "", openingBalance: "0", notes: "" });
  const qc = useQueryClient();
  const { data, isLoading } = useListSuppliers({ search: search || undefined }, { query: { queryKey: getListSuppliersQueryKey({ search }) } });
  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const handleDelete = async (id: number) => {
    await deleteSupplier.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey({}) });
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey({ search }) });
    toast.success("تم حذف/أرشفة المورد");
  };

  const handleAdd = async () => {
    if (!form.name) { toast.error("الاسم مطلوب"); return; }
    await createSupplier.mutateAsync({ data: { ...form, openingBalance: parseFloat(form.openingBalance) || 0 } });
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey({}) });
    toast.success("تم إضافة المورد");
    setShowAdd(false);
  };

  const suppliers = (data as any)?.items || [];

  // Keyboard navigation for the table (Arrow Up/Down + Enter opens the row).
  const { activeIndex, onKeyDown: onSearchKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: suppliers,
    onSelect: (s: any) => setSelectedId(s.id),
    resetKey: search,
    highlightFirst: false, // full-page table: no row pre-selected until keyboard nav
  });

  return (
    <div className="space-y-4">
      {selectedId && (
        <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
          <SupplierProfile id={selectedId} />
        </Dialog>
      )}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>إضافة مورد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>هاتف</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>جهة الاتصال</Label><Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} /></div>
            <div className="space-y-1"><Label>رصيد افتتاحي</Label><Input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1"><Label>العنوان</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={createSupplier.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-end">
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 ml-2" />إضافة مورد</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9" placeholder="بحث بالاسم..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">المورد</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">جهة الاتصال</th>
              <th className="p-3 text-left">المستحق</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              suppliers.map((s: any, i: number) => (
                <tr key={s.id} {...getItemProps(i)} className={cn("border-b", activeIndex === i ? "nav-active" : "nav-hover")}>
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-muted-foreground">{s.phone || "—"}</td>
                  <td className="p-3 text-muted-foreground">{s.contactPerson || "—"}</td>
                  <td className="p-3 text-left">{s.totalDebt > 0 ? <span className="text-destructive font-bold">{formatCurrency(s.totalDebt)}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(s.id)}><Eye className="h-4 w-4 ml-1" />عرض</Button>
                      <DeleteButton entity="suppliers" id={s.id} label={`المورد «${s.name}»`} onDelete={() => handleDelete(s.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && suppliers.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />لا يوجد موردون
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

interface AttrItem { id: number; name: string; nameEn?: string | null; productCount?: number }

/**
 * Generic CRUD tab for a simple {name, nameEn} lookup list (categories / brands /
 * units). These lists feed the التصنيف / الماركة / وحدة القياس dropdowns in the
 * product add/edit form (and anywhere else that reads the same entities), so adding
 * an entry here makes it selectable everywhere immediately.
 */
function AttributeTab({
  singular,
  addLabel,
  emptyLabel,
  headerLabel,
  Icon,
  entity,
  showCount = false,
  useList,
  useCreate,
  useUpdate,
  useDelete,
  getQueryKey,
}: {
  singular: string;
  addLabel: string;
  emptyLabel: string;
  headerLabel: string;
  Icon: LucideIcon;
  entity: "categories" | "brands" | "units";
  showCount?: boolean;
  // The generated hooks/query-key helpers for the chosen entity.
  useList: any;
  useCreate: any;
  useUpdate: any;
  useDelete: any;
  getQueryKey: () => readonly unknown[];
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useList({ query: { queryKey: getQueryKey() } });
  const create = useCreate();
  const update = useUpdate();
  const del = useDelete();

  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", nameEn: "" });

  const items = (data as AttrItem[]) || [];
  const invalidate = () => qc.invalidateQueries({ queryKey: getQueryKey() });
  const colSpan = showCount ? 4 : 3;

  const openAdd = () => { setEditId(null); setForm({ name: "", nameEn: "" }); setShowAdd(true); };
  const openEdit = (it: AttrItem) => { setEditId(it.id); setForm({ name: it.name || "", nameEn: it.nameEn || "" }); setShowAdd(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); return; }
    try {
      if (editId) {
        await update.mutateAsync({ id: editId, data: { name: form.name.trim(), nameEn: form.nameEn.trim() || undefined } });
        toast.success(`تم تعديل ${singular}`);
      } else {
        await create.mutateAsync({ data: { name: form.name.trim(), nameEn: form.nameEn.trim() || undefined } });
        toast.success(`تم إضافة ${singular}`);
      }
      invalidate();
      setShowAdd(false);
    } catch {
      toast.error("حدث خطأ، حاول مرة أخرى");
    }
  };

  const handleDelete = async (it: AttrItem) => {
    await del.mutateAsync({ id: it.id });
    invalidate();
    toast.success(`تم حذف ${singular}`);
  };

  return (
    <div className="space-y-4">
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editId ? `تعديل ${singular}` : addLabel}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>الاسم بالإنجليزية</Label><Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 ml-2" />{addLabel}</Button>
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">{headerLabel}</th>
              <th className="p-3">بالإنجليزية</th>
              {showCount && <th className="p-3 text-left">عدد المنتجات</th>}
              <th className="p-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              items.map((it) => (
                <tr key={it.id} className="border-b nav-hover">
                  <td className="p-3 font-medium">{it.name}</td>
                  <td className="p-3 text-muted-foreground">{it.nameEn || "—"}</td>
                  {showCount && <td className="p-3 text-left text-muted-foreground">{it.productCount ?? 0}</td>}
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(it)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                      <DeleteButton entity={entity} id={it.id} label={`${singular} «${it.name}»`} onDelete={() => handleDelete(it)} />
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={colSpan} className="p-8 text-center text-muted-foreground">
                <Icon className="h-10 w-10 mx-auto mb-2 opacity-30" />{emptyLabel}
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
