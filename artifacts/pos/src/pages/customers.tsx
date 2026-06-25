import { useState } from "react";
import {
  useListCustomers,
  useCreateCustomer,
  useGetCustomer,
  useGetCustomerStatement,
  useGetCustomerPayments,
  useAddCustomerPayment,
  useGetCustomerInvoices,
  useGetCustomerQuotations,
  getListCustomersQueryKey,
  getGetCustomerStatementQueryKey,
  getGetCustomerPaymentsQueryKey,
  getGetCustomerInvoicesQueryKey,
  getGetCustomerQuotationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { Search, Plus, Users, Eye, CreditCard, Receipt, FileText, HardHat } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  finalized: { label: "مكتملة", variant: "default" },
  partially_paid: { label: "جزئي", variant: "outline" },
  paid: { label: "مدفوعة", variant: "default" },
  credit: { label: "آجل", variant: "destructive" },
  cancelled: { label: "ملغية", variant: "secondary" },
};
const Q_STATUS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكدة", variant: "outline" },
  converted: { label: "محولة", variant: "default" },
  cancelled: { label: "ملغية", variant: "destructive" },
};
const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };

function CustomerProfile({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const qc = useQueryClient();
  const { data: customer } = useGetCustomer(customerId);
  const { data: statement } = useGetCustomerStatement(customerId, { query: { queryKey: getGetCustomerStatementQueryKey(customerId) } });
  const { data: payments } = useGetCustomerPayments(customerId, { query: { queryKey: getGetCustomerPaymentsQueryKey(customerId) } });
  const addPayment = useAddCustomerPayment();

  const { data: invoicesData } = useGetCustomerInvoices(customerId, { query: { queryKey: getGetCustomerInvoicesQueryKey(customerId) } });
  const { data: quotationsData } = useGetCustomerQuotations(customerId, { query: { queryKey: getGetCustomerQuotationsQueryKey(customerId) } });

  const handlePay = async () => {
    if (!payAmount) { toast.error("أدخل المبلغ"); return; }
    await addPayment.mutateAsync({ id: customerId, data: { amount: parseFloat(payAmount), date: new Date().toISOString().split("T")[0], notes: payNote } });
    qc.invalidateQueries({ queryKey: getListCustomersQueryKey({}) });
    qc.invalidateQueries({ queryKey: getGetCustomerStatementQueryKey(customerId) });
    toast.success("تم تسجيل الدفعة");
    setPayAmount(""); setPayNote("");
  };

  if (!customer) return null;
  const stmt = statement as any;
  const invoices = (invoicesData as any)?.items || [];
  const quotations = (quotationsData as any)?.items || [];

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{(customer as any).name}</DialogTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>{(customer as any).phone || "لا يوجد هاتف"}</span>
          <span>{(customer as any).area || ""}</span>
        </div>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-destructive">{formatCurrency((customer as any).totalDebt)}</p>
          <p className="text-xs text-muted-foreground">إجمالي المديونية</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{formatCurrency(stmt?.totalInvoiced)}</p>
          <p className="text-xs text-muted-foreground">إجمالي الفواتير</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stmt?.totalPaid)}</p>
          <p className="text-xs text-muted-foreground">إجمالي المدفوع</p>
        </CardContent></Card>
      </div>
      <div className="flex gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
        <Input type="number" placeholder="المبلغ" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-32" />
        <Input placeholder="ملاحظات الدفعة" value={payNote} onChange={e => setPayNote(e.target.value)} className="flex-1" />
        <Button onClick={handlePay} disabled={addPayment.isPending}>
          <CreditCard className="h-4 w-4 ml-2" />
          تسجيل دفعة
        </Button>
      </div>
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">
            <Receipt className="h-3.5 w-3.5 ml-1" />
            الفواتير ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="quotations">
            <FileText className="h-3.5 w-3.5 ml-1" />
            التسعيرات ({quotations.length})
          </TabsTrigger>
          <TabsTrigger value="statement">كشف الحساب</TabsTrigger>
          <TabsTrigger value="payments">الدفعات</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد فواتير لهذا العميل</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">الفاتورة</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">الصنايعي</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-left">الإجمالي</th>
                  <th className="p-2 text-left">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-mono font-medium text-primary">{inv.serial}</td>
                    <td className="p-2 text-muted-foreground text-xs">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-2">
                      {inv.craftsmanName
                        ? <span className="flex items-center gap-1 text-amber-700"><HardHat className="h-3 w-3" />{inv.craftsmanName}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge>
                    </td>
                    <td className="p-2 text-left font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="p-2 text-left">
                      {inv.remainingAmount > 0
                        ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span>
                        : <span className="text-emerald-600 text-xs">مسدد</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="quotations">
          {quotations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد تسعيرات لهذا العميل</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-right">التسعيرة</th>
                  <th className="p-2 text-right">التاريخ</th>
                  <th className="p-2 text-right">الصنايعي</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-left">الإجمالي</th>
                  <th className="p-2 text-right">الفاتورة</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q: any) => (
                  <tr key={q.id} className="border-b hover:bg-muted/30">
                    <td className="p-2 font-mono font-medium text-primary">{q.serial}</td>
                    <td className="p-2 text-muted-foreground text-xs">{new Date(q.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-2">
                      {q.craftsmanName
                        ? <span className="flex items-center gap-1 text-amber-700"><HardHat className="h-3 w-3" />{q.craftsmanName}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      <Badge variant={Q_STATUS[q.status]?.variant}>{Q_STATUS[q.status]?.label}</Badge>
                    </td>
                    <td className="p-2 text-left font-semibold">{formatCurrency(q.total)}</td>
                    <td className="p-2 text-xs text-muted-foreground font-mono">
                      {q.convertedInvoiceSerial || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="statement">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">البيان</th>
              <th className="p-2 text-left">مدين</th>
              <th className="p-2 text-left">دائن</th>
              <th className="p-2 text-left">الرصيد</th>
            </tr></thead>
            <tbody>
              {stmt?.entries?.map((e: any, i: number) => (
                <tr key={i} className="border-b">
                  <td className="p-2 text-muted-foreground text-xs">{new Date(e.date).toLocaleDateString("ar-EG")}</td>
                  <td className="p-2">{e.description}</td>
                  <td className="p-2 text-left text-destructive">{e.debit ? formatCurrency(e.debit) : "—"}</td>
                  <td className="p-2 text-left text-emerald-600">{e.credit ? formatCurrency(e.credit) : "—"}</td>
                  <td className="p-2 text-left font-semibold">{formatCurrency(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="payments">
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
                  <td className="p-2 text-left text-emerald-600 font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="p-2 text-muted-foreground">{p.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", phone2: "", address: "", area: "", openingBalance: "0", creditLimit: "", notes: "" });
  const qc = useQueryClient();
  const { data, isLoading } = useListCustomers({ search: search || undefined }, { query: { queryKey: getListCustomersQueryKey({ search }) } });
  const createCustomer = useCreateCustomer();

  const handleAdd = async () => {
    if (!form.name) { toast.error("الاسم مطلوب"); return; }
    await createCustomer.mutateAsync({ data: { ...form, openingBalance: parseFloat(form.openingBalance) || 0, creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined } });
    qc.invalidateQueries({ queryKey: getListCustomersQueryKey({}) });
    toast.success("تم إضافة العميل");
    setShowAdd(false);
    setForm({ name: "", phone: "", phone2: "", address: "", area: "", openingBalance: "0", creditLimit: "", notes: "" });
  };

  const customers = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      {selectedId && (
        <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
          <CustomerProfile customerId={selectedId} onClose={() => setSelectedId(null)} />
        </Dialog>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>هاتف</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>هاتف 2</Label><Input value={form.phone2} onChange={e => setForm(f => ({ ...f, phone2: e.target.value }))} /></div>
            <div className="space-y-1"><Label>المنطقة</Label><Input value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} /></div>
            <div className="space-y-1"><Label>رصيد افتتاحي</Label><Input type="number" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1"><Label>العنوان</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={createCustomer.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 ml-2" />
          عميل جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث بالاسم أو الهاتف..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-3">العميل</th>
                <th className="p-3">الهاتف</th>
                <th className="p-3">المنطقة</th>
                <th className="p-3 text-left">المديونية</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                customers.map((c: any) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.area || "—"}</td>
                    <td className="p-3 text-left">
                      {c.totalDebt > 0 ? <span className="font-bold text-destructive">{formatCurrency(c.totalDebt)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(c.id)}>
                        <Eye className="h-4 w-4 ml-1" /> عرض
                      </Button>
                    </td>
                  </tr>
                ))
              }
              {!isLoading && customers.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  لا يوجد عملاء
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
