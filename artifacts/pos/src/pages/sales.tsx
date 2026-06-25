import { useState } from "react";
import {
  useListSalesInvoices,
  useGetSalesInvoice,
  getListSalesInvoicesQueryKey,
  getGetSalesInvoiceQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { Search, Printer, Receipt, Eye } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  finalized: { label: "مكتملة", variant: "default" },
  partially_paid: { label: "مدفوع جزئي", variant: "outline" },
  paid: { label: "مدفوعة", variant: "default" },
  credit: { label: "آجل", variant: "destructive" },
  cancelled: { label: "ملغية", variant: "secondary" },
};
const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };

function InvoiceDetail({ invoiceId }: { invoiceId: number }) {
  const { data: invoice } = useGetSalesInvoice(invoiceId, { query: { queryKey: getGetSalesInvoiceQueryKey(invoiceId) } });
  const inv = invoice as any;
  if (!inv) return <div className="p-8 text-center">جاري التحميل...</div>;

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print-area">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle>فاتورة {inv.serial}</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 ml-2" />
            طباعة
          </Button>
        </div>
      </DialogHeader>
      <div className="print:block">
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div><span className="text-muted-foreground">التاريخ:</span> <span className="font-medium">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</span></div>
          <div><span className="text-muted-foreground">الحالة:</span> <Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge></div>
          <div><span className="text-muted-foreground">العميل:</span> <span className="font-medium">{inv.customerName || "عميل نقدي"}</span></div>
          <div><span className="text-muted-foreground">الدفع:</span> <span>{PAYMENT_LABELS[inv.paymentType] || inv.paymentType}</span></div>
          {inv.craftsmanName && <div><span className="text-muted-foreground">الصنايعي:</span> <span>{inv.craftsmanName}</span></div>}
        </div>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-right">المنتج</th>
              <th className="p-2 text-center">الكمية</th>
              <th className="p-2 text-left">السعر</th>
              <th className="p-2 text-left">الخصم</th>
              <th className="p-2 text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {inv.items?.map((item: any) => (
              <tr key={item.id} className="border-t">
                <td className="p-2">{item.productName}</td>
                <td className="p-2 text-center">{item.quantity} {item.unitName}</td>
                <td className="p-2 text-left">{formatCurrency(item.unitPrice)}</td>
                <td className="p-2 text-left">{item.discount ? formatCurrency(item.discount) : "—"}</td>
                <td className="p-2 text-left font-semibold">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 space-y-1 text-sm bg-muted/30 p-4 rounded-lg">
          <div className="flex justify-between"><span>الإجمالي الفرعي:</span><span>{formatCurrency(inv.subtotal)}</span></div>
          {inv.discount > 0 && <div className="flex justify-between text-destructive"><span>الخصم:</span><span>- {formatCurrency(inv.discount)}</span></div>}
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>الإجمالي:</span><span className="text-primary">{formatCurrency(inv.total)}</span></div>
          {inv.paidAmount > 0 && <div className="flex justify-between text-emerald-600"><span>المدفوع:</span><span>{formatCurrency(inv.paidAmount)}</span></div>}
          {inv.remainingAmount > 0 && <div className="flex justify-between text-destructive font-semibold"><span>المتبقي:</span><span>{formatCurrency(inv.remainingAmount)}</span></div>}
        </div>
      </div>
    </DialogContent>
  );
}

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const params = { search: search || undefined, status: statusFilter || undefined, paymentType: paymentFilter || undefined, limit: 100 };
  const { data, isLoading } = useListSalesInvoices(params, { query: { queryKey: getListSalesInvoicesQueryKey(params) } });
  const invoices = (data as any)?.items || [];

  return (
    <div className="space-y-4">
      {selectedId && (
        <Dialog open={!!selectedId} onOpenChange={() => setSelectedId(null)}>
          <InvoiceDetail invoiceId={selectedId} />
        </Dialog>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">فواتير المبيعات</h1>
        <Badge variant="outline" className="text-sm">{(data as any)?.total || 0} فاتورة</Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="رقم الفاتورة أو اسم العميل..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || "__none__"} onValueChange={(v) => setStatusFilter(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">كل الحالات</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={paymentFilter || "__none__"} onValueChange={(v) => setPaymentFilter(v === "__none__" ? "" : v)}>
              <SelectTrigger className="w-32"><SelectValue placeholder="طريقة الدفع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">الكل</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="credit">آجل</SelectItem>
                <SelectItem value="partial">جزئي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-3">الرقم</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الدفع</th>
                <th className="p-3 text-left">الإجمالي</th>
                <th className="p-3 text-left">المتبقي</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-medium text-primary">{inv.serial}</td>
                    <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3">{inv.customerName || <span className="text-muted-foreground">نقدي</span>}</td>
                    <td className="p-3"><Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge></td>
                    <td className="p-3">{PAYMENT_LABELS[inv.paymentType] || inv.paymentType}</td>
                    <td className="p-3 text-left font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="p-3 text-left">{inv.remainingAmount > 0 ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span> : <span className="text-emerald-600">مسدد</span>}</td>
                    <td className="p-3">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(inv.id)}>
                        <Eye className="h-4 w-4 ml-1" /> عرض
                      </Button>
                    </td>
                  </tr>
                ))
              }
              {!isLoading && invoices.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  لا توجد فواتير
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
