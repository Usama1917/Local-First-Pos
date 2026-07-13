import { useState } from "react";
import {
  useListCustomerDebts,
  useListSupplierDebts,
  useAddCustomerPayment,
  useAddSupplierPayment,
  getListCustomerDebtsQueryKey,
  getListSupplierDebtsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { CreditCard, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

function PaymentDialog({ entity, type, onClose }: { entity: any; type: "customer" | "supplier"; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const qc = useQueryClient();
  const addCustomerPayment = useAddCustomerPayment();
  const addSupplierPayment = useAddSupplierPayment();

  const handleSave = async () => {
    if (!amount) { toast.error("أدخل المبلغ"); return; }
    const payData = { amount: parseFloat(amount), date: new Date().toISOString().split("T")[0], notes: notes || undefined };
    if (type === "customer") {
      await addCustomerPayment.mutateAsync({ id: entity.id, data: payData });
      qc.invalidateQueries({ queryKey: getListCustomerDebtsQueryKey() });
    } else {
      await addSupplierPayment.mutateAsync({ id: entity.id, data: payData });
      qc.invalidateQueries({ queryKey: getListSupplierDebtsQueryKey() });
    }
    toast.success("تم تسجيل الدفعة");
    onClose();
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>تسجيل دفعة — {entity.name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="bg-muted/50 p-3 rounded text-center">
          <p className="text-2xl font-bold text-destructive">{formatCurrency(entity.balance)}</p>
          <p className="text-xs text-muted-foreground">{type === "customer" ? "مديونية العميل" : "المستحق للمورد"}</p>
        </div>
        <div className="space-y-1"><Label>المبلغ المدفوع</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></div>
        <div className="space-y-1"><Label>ملاحظات</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={handleSave} disabled={addCustomerPayment.isPending || addSupplierPayment.isPending}>
          <CreditCard className="h-4 w-4 ml-2" />
          تسجيل الدفعة
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function DebtsPage() {
  const [payEntity, setPayEntity] = useState<any>(null);
  const [payType, setPayType] = useState<"customer" | "supplier">("customer");
  const { data: customerDebts, isLoading: loadingCust } = useListCustomerDebts({ query: { queryKey: getListCustomerDebtsQueryKey() } });
  const { data: supplierDebts, isLoading: loadingSupp } = useListSupplierDebts({ query: { queryKey: getListSupplierDebtsQueryKey() } });

  const custDebts = (customerDebts as any[]) || [];
  const suppDebts = (supplierDebts as any[]) || [];
  const totalReceivables = custDebts.reduce((s: number, d: any) => s + d.balance, 0);
  const totalPayables = suppDebts.reduce((s: number, d: any) => s + d.balance, 0);

  const openPay = (entity: any, type: "customer" | "supplier") => {
    setPayEntity(entity); setPayType(type);
  };

  return (
    <div className="space-y-4">
      {payEntity && (
        <Dialog open={!!payEntity} onOpenChange={() => setPayEntity(null)}>
          <PaymentDialog entity={payEntity} type={payType} onClose={() => setPayEntity(null)} />
        </Dialog>
      )}

      <h1 className="text-2xl font-bold">المديونيات</h1>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-destructive/10 p-3 rounded-full"><TrendingUp className="h-6 w-6 text-destructive" /></div>
            <div>
              <p className="text-2xl font-bold text-destructive">{formatCurrency(totalReceivables)}</p>
              <p className="text-sm text-muted-foreground">إجمالي مديونيات العملاء</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-amber-500/10 p-3 rounded-full"><TrendingDown className="h-6 w-6 text-amber-600 dark:text-amber-400" /></div>
            <div>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(totalPayables)}</p>
              <p className="text-sm text-muted-foreground">إجمالي المستحق للموردين</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">مديونيات العملاء ({custDebts.length})</TabsTrigger>
          <TabsTrigger value="suppliers">مستحقات الموردين ({suppDebts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3">العميل</th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3">المنطقة</th>
                  <th className="p-3 text-center">فواتير مفتوحة</th>
                  <th className="p-3 text-left">المديونية</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {loadingCust ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                  custDebts.map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{d.name}</td>
                      <td className="p-3 text-muted-foreground">{d.phone || "—"}</td>
                      <td className="p-3 text-muted-foreground">{d.area || "—"}</td>
                      <td className="p-3 text-center">{d.openInvoices}</td>
                      <td className="p-3 text-left font-bold text-destructive">{formatCurrency(d.balance)}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm" onClick={() => openPay(d, "customer")}>
                          <CreditCard className="h-4 w-4 ml-1" /> سداد
                        </Button>
                      </td>
                    </tr>
                  ))
                }
                {!loadingCust && custDebts.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد مديونيات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-right">
                  <th className="p-3">المورد</th>
                  <th className="p-3">الهاتف</th>
                  <th className="p-3 text-center">فواتير مفتوحة</th>
                  <th className="p-3 text-left">المستحق</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {loadingSupp ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                  suppDebts.map((d: any) => (
                    <tr key={d.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{d.name}</td>
                      <td className="p-3 text-muted-foreground">{d.phone || "—"}</td>
                      <td className="p-3 text-center">{d.openInvoices}</td>
                      <td className="p-3 text-left font-bold text-amber-600 dark:text-amber-400">{formatCurrency(d.balance)}</td>
                      <td className="p-3">
                        <Button variant="outline" size="sm" onClick={() => openPay(d, "supplier")}>
                          <CreditCard className="h-4 w-4 ml-1" /> سداد
                        </Button>
                      </td>
                    </tr>
                  ))
                }
                {!loadingSupp && suppDebts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد مستحقات</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
