import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useListSalesInvoices,
  useGetSalesInvoice,
  useDeleteSalesInvoice,
  useListCraftsmen,
  useGetSettings,
  lookupSalesInvoiceBySerial,
  getListSalesInvoicesQueryKey,
  getGetSalesInvoiceQueryKey,
  getListCraftsmenQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { DeleteButton } from "@/components/ui/delete-confirm";
import JsBarcode from "jsbarcode";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AuditInfo } from "@/components/ui/audit-info";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { printInvoice } from "@/lib/print-invoice";
import { PRINT_FORMATS, normalizeFormat } from "@/lib/print-document";
import { Search, Printer, Receipt, Eye, HardHat, ChevronDown, Pencil, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  finalized: { label: "مكتملة", variant: "default" },
  partially_paid: { label: "مدفوع جزئي", variant: "outline" },
  paid: { label: "مدفوعة", variant: "default" },
  credit: { label: "آجل", variant: "destructive" },
  cancelled: { label: "ملغية", variant: "secondary" },
  amended: { label: "معدّلة", variant: "secondary" },
};

/** A closed, live invoice can be superseded by a corrected one. Drafts are edited
 *  in place, and cancelled/already-amended invoices are frozen history. */
const canAmend = (inv: any) =>
  ["finalized", "partially_paid", "credit", "paid"].includes(inv.status) && !inv.amendedToId;
const PAYMENT_LABELS: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          width: 1.6,
          height: 44,
          displayValue: true,
          fontSize: 13,
          textMargin: 2,
          margin: 0,
        });
      } catch {
        /* ignore invalid barcode values */
      }
    }
  }, [value]);
  return <svg ref={ref} className="max-w-full" />;
}

function InvoiceDetail({ invoiceId }: { invoiceId: number }) {
  const { data: invoice } = useGetSalesInvoice(invoiceId, { query: { queryKey: getGetSalesInvoiceQueryKey(invoiceId) } });
  const { data: settings } = useGetSettings();
  const inv = invoice as any;
  const shop = settings as any;
  const defaultFormat = normalizeFormat(shop?.defaultPrintTemplate);

  if (!inv) {
    return (
      <DialogContent>
        <DialogTitle className="sr-only">فاتورة</DialogTitle>
        <div className="p-8 text-center">جاري التحميل...</div>
      </DialogContent>
    );
  }

  const items: any[] = inv.items || [];
  const grossSubtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const itemsDiscount = items.reduce((s, i) => s + (i.discount || 0), 0);
  const totalDiscount = itemsDiscount + (inv.discount || 0);

  return (
    // hideClose: the pinned corner ✕ sits on top of the right-aligned title in
    // RTL, so this dialog carries its own close button in the toolbar instead.
    <DialogContent hideClose className="max-w-3xl max-h-[90vh] overflow-y-auto gap-0 p-0">
      {/* Toolbar — not printed */}
      <div className="no-print flex items-center justify-between gap-3 border-b px-6 py-3">
        {/* Close sits first so RTL puts it in the far-right corner, and being in
            the flex flow it can't land on top of the title the way the pinned
            `absolute right-4` one did. */}
        <div className="flex items-center gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="إغلاق">
              <X className="h-4 w-4" />
              <span className="sr-only">إغلاق</span>
            </Button>
          </DialogClose>
          <DialogTitle>فاتورة {inv.serial}</DialogTitle>
        </div>
        <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Printer className="h-4 w-4 ml-2" />
              طباعة
              <ChevronDown className="h-3.5 w-3.5 mr-1 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PRINT_FORMATS.map((f) => (
              <DropdownMenuItem
                key={f.key}
                onClick={() => {
                  if (!printInvoice(inv, shop, f.key)) toast.error("فعّل النوافذ المنبثقة (Popup) للطباعة");
                }}
              >
                طباعة {f.label}
                {defaultFormat === f.key && <span className="mr-auto text-xs text-muted-foreground">افتراضي</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* Printable invoice document */}
      <div className="invoice-print px-8 py-6">
        {/* Header: shop info + barcode of the serial */}
        <div className="flex items-start justify-between gap-6 border-b-2 border-foreground/70 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-2xl font-extrabold leading-tight">{shop?.shopName || "المحل"}</h2>
            {shop?.shopAddress && <p className="text-xs text-muted-foreground">{shop.shopAddress}</p>}
            {shop?.shopPhone && <p className="text-xs text-muted-foreground">☎ {shop.shopPhone}</p>}
          </div>
          <div className="shrink-0 text-center">
            <Barcode value={inv.serial} />
          </div>
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between py-3">
          <h3 className="text-lg font-bold">فاتورة مبيعات</h3>
          <Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge>
        </div>

        {/* Meta box */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg border bg-muted/20 p-4 text-sm">
          <div><span className="text-muted-foreground">العميل:</span> <span className="font-semibold">{inv.customerName || "عميل نقدي"}</span></div>
          <div><span className="text-muted-foreground">رقم الفاتورة:</span> <span className="font-mono font-bold">{inv.serial}</span></div>
          <div>
            <span className="text-muted-foreground">الصنايعي / الفني:</span>{" "}
            <span className="font-semibold">{inv.craftsmanName || "—"}</span>
          </div>
          <div><span className="text-muted-foreground">التاريخ:</span> <span className="font-medium">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</span></div>
          <div><span className="text-muted-foreground">طريقة الدفع:</span> <span>{PAYMENT_LABELS[inv.paymentType] || inv.paymentType}</span></div>
          {/* Amendment chain — printed too, so a customer holding either copy can
              tell which one is the valid invoice. */}
          {inv.amendedFromSerial && (
            <div className="col-span-2">
              <span className="text-muted-foreground">تعديل للفاتورة:</span>{" "}
              <span className="font-mono font-semibold">{inv.amendedFromSerial}</span>
            </div>
          )}
          {inv.amendedToSerial && (
            <div className="col-span-2 font-semibold text-destructive">
              هذه الفاتورة تم تعديلها — الفاتورة السارية هي{" "}
              <span className="font-mono">{inv.amendedToSerial}</span>
            </div>
          )}
        </div>

        {/* Line items */}
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/60">
              <th className="w-8 border border-foreground/20 p-2 text-center">#</th>
              <th className="border border-foreground/20 p-2 text-right">المنتج</th>
              <th className="border border-foreground/20 p-2 text-center">الكمية</th>
              <th className="border border-foreground/20 p-2 text-center">السعر</th>
              <th className="border border-foreground/20 p-2 text-center">الخصم</th>
              <th className="border border-foreground/20 p-2 text-center">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id}>
                <td className="border border-foreground/20 p-2 text-center text-muted-foreground">{idx + 1}</td>
                <td className="border border-foreground/20 p-2">
                  <span className="font-medium">{item.productName}</span>
                  {item.sku && <span className="text-xs text-muted-foreground"> ({item.sku})</span>}
                </td>
                <td className="border border-foreground/20 p-2 text-center">{item.quantity} {item.unitName || ""}</td>
                <td className="border border-foreground/20 p-2 text-center">{formatCurrency(item.unitPrice)}</td>
                <td className="border border-foreground/20 p-2 text-center">{item.discount ? formatCurrency(item.discount) : "—"}</td>
                <td className="border border-foreground/20 p-2 text-center font-semibold">{formatCurrency(item.total)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="border border-foreground/20 p-4 text-center text-muted-foreground">لا توجد أصناف</td></tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي الفرعي:</span><span>{formatCurrency(grossSubtotal)}</span></div>
            {totalDiscount > 0 && <div className="flex justify-between text-destructive"><span>إجمالي الخصم:</span><span>- {formatCurrency(totalDiscount)}</span></div>}
            <div className="flex justify-between border-t border-foreground/40 pt-1 text-base font-bold"><span>الإجمالي:</span><span>{formatCurrency(inv.total)}</span></div>
            {inv.paidAmount > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>المدفوع:</span><span>{formatCurrency(inv.paidAmount)}</span></div>}
            {inv.remainingAmount > 0 && <div className="flex justify-between font-semibold text-destructive"><span>المتبقي (على العميل):</span><span>{formatCurrency(inv.remainingAmount)}</span></div>}
          </div>
        </div>

        {inv.notes && <p className="mt-4 text-sm"><span className="text-muted-foreground">ملاحظات:</span> {inv.notes}</p>}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-12 text-sm">
          <div className="text-center">
            <div className="mx-auto w-48 border-t border-foreground/60 pt-1">توقيع صاحب المحل</div>
          </div>
          <div className="text-center">
            <div className="mx-auto w-48 border-t border-foreground/60 pt-1">
              توقيع {inv.craftsmanName ? "العميل / الصنايعي" : "العميل"}
            </div>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          شكراً لتعاملكم معنا{shop?.shopPhone ? ` — للاستفسار: ${shop.shopPhone}` : ""}
        </p>
      </div>
    </DialogContent>
  );
}

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [craftsmanFilter, setCraftsmanFilter] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Deep-link: /sales?open=<invoiceId> (e.g. clicking an invoice on the dashboard)
  // opens that invoice's detail dialog, then strips the param so re-clicking the
  // same invoice works again.
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  useEffect(() => {
    const openId = new URLSearchParams(searchString).get("open");
    if (openId) {
      setSelectedId(Number(openId));
      setLocation("/sales", { replace: true });
    }
  }, [searchString, setLocation]);

  const craftsmenParams = {};
  const { data: craftsmenData } = useListCraftsmen(craftsmenParams, { query: { queryKey: getListCraftsmenQueryKey(craftsmenParams) } });
  const craftsmen = (craftsmenData as any)?.items || [];

  const params = {
    search: search || undefined,
    status: statusFilter || undefined,
    paymentType: paymentFilter || undefined,
    craftsmanId: craftsmanFilter ? Number(craftsmanFilter) : undefined,
    limit: 100,
  };
  const { data, isLoading } = useListSalesInvoices(params, { query: { queryKey: getListSalesInvoicesQueryKey(params) } });
  const invoices = (data as any)?.items || [];
  const qc = useQueryClient();
  const deleteInvoice = useDeleteSalesInvoice();

  // Keyboard navigation for the invoices table (Arrow Up/Down + Enter opens the row).
  const { activeIndex, onKeyDown: navKeyDown, getItemProps } = useListKeyboardNav<any>({
    items: invoices,
    onSelect: (inv: any) => setSelectedId(inv.id),
    resetKey: search,
    highlightFirst: false, // full-page table: no row pre-selected until keyboard nav
  });

  const handleDelete = async (id: number) => {
    await deleteInvoice.mutateAsync({ id });
    // Deleting a finalized invoice touches stock, customer debt, craftsman
    // commission and possibly a linked quotation — refresh everything.
    qc.invalidateQueries();
    toast.success("تم حذف الفاتورة وعكس آثارها (مخزون/مديونية/عمولة)");
  };

  // Open an invoice by its serial / scanned barcode.
  const openInvoiceBySerial = async (code: string, notify = false) => {
    try {
      const found = await lookupSalesInvoiceBySerial(code);
      if ((found as any)?.id) { setSelectedId((found as any).id); return true; }
    } catch {
      /* not found */
    }
    if (notify) toast.error(`لا توجد فاتورة بالرقم: ${code}`);
    return false;
  };

  // Enter in the search box: first try to open by exact serial/barcode (scanner
  // workflow); if nothing matched, open the row highlighted by the arrow keys.
  const handleScanOpen = async (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = search.trim();
    if (code && (await openInvoiceBySerial(code))) return;
    // Only open a row via Enter if the arrow keys highlighted one (activeIndex ≥ 0).
    if (invoices.length > 0 && activeIndex >= 0) setSelectedId(invoices[Math.min(activeIndex, invoices.length - 1)]?.id);
  };

  // Compose: Enter → serial lookup / open highlighted row; Arrow keys → move the highlight.
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { void handleScanOpen(e); return; }
    navKeyDown(e);
  };

  // Hardware laser scanner: scan an invoice barcode anywhere on the page → opens it.
  useBarcodeScanner((code) => { void openInvoiceBySerial(code, true); });

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
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pr-9"
                placeholder="رقم الفاتورة / باركود / اسم العميل... (امسح الباركود واضغط Enter)"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={onSearchKeyDown}
              />
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
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-right">
                <th className="p-3">الرقم</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الصنايعي</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الدفع</th>
                <th className="p-3 text-left">الإجمالي</th>
                <th className="p-3 text-left">المتبقي</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
                invoices.map((inv: any, i: number) => (
                  <tr key={inv.id} {...getItemProps(i)} className={cn("border-b", activeIndex === i ? "nav-active" : "nav-hover")}>
                    <td className="p-3 font-mono font-medium text-primary">
                      {inv.serial}
                      {/* The amendment chain, readable from either row. */}
                      {inv.amendedToSerial && (
                        <span className="block font-sans text-[11px] text-muted-foreground">
                          استُبدلت بـ <span className="font-mono">{inv.amendedToSerial}</span>
                        </span>
                      )}
                      {inv.amendedFromSerial && (
                        <span className="block font-sans text-[11px] text-amber-700 dark:text-amber-400">
                          تعديل لـ <span className="font-mono">{inv.amendedFromSerial}</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td className="p-3">{inv.customerName || <span className="text-muted-foreground">نقدي</span>}</td>
                    <td className="p-3">
                      {inv.craftsmanName
                        ? <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs"><HardHat className="h-3 w-3" />{inv.craftsmanName}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3"><Badge variant={STATUS_LABELS[inv.status]?.variant}>{STATUS_LABELS[inv.status]?.label}</Badge></td>
                    <td className="p-3">{PAYMENT_LABELS[inv.paymentType] || inv.paymentType}</td>
                    <td className="p-3 text-left font-semibold">{formatCurrency(inv.total)}</td>
                    <td className="p-3 text-left">{inv.remainingAmount > 0 ? <span className="text-destructive font-semibold">{formatCurrency(inv.remainingAmount)}</span> : <span className="text-emerald-600 dark:text-emerald-400">مسدد</span>}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedId(inv.id)}>
                          <Eye className="h-4 w-4 ml-1" /> عرض
                        </Button>
                        {/* Always rendered — hidden rather than dropped on rows that
                            can't be amended, so the action buttons stay in the same
                            column instead of sliding across from row to row. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          title="فتح الفاتورة في الكاشير للتعديل"
                          onClick={() => setLocation(`/pos?amend=${inv.id}`)}
                          className={cn(!canAmend(inv) && "invisible pointer-events-none")}
                          aria-hidden={!canAmend(inv)}
                          tabIndex={canAmend(inv) ? undefined : -1}
                        >
                          <Pencil className="h-4 w-4 ml-1" /> تعديل
                        </Button>
                        <DeleteButton entity="sales" id={inv.id} label={`الفاتورة ${inv.serial}`} onDelete={() => handleDelete(inv.id)} />
                        <AuditInfo
                          createdBy={inv.createdBy}
                          createdAt={inv.createdAt}
                          updatedBy={inv.updatedBy}
                          updatedAt={inv.updatedAt}
                          originSerial={inv.amendedFromSerial}
                          originBy={inv.amendedFromBy}
                          originAt={inv.amendedFromAt}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              }
              {!isLoading && invoices.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
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
