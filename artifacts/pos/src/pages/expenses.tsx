import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import {
  useListExpenses,
  getListExpensesQueryKey,
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useListRecurringExpenses,
  getListRecurringExpensesQueryKey,
  useCreateRecurringExpense,
  useUpdateRecurringExpense,
  useDeleteRecurringExpense,
  usePayRecurringExpense,
  getGetExpensesDueSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteButton } from "@/components/ui/delete-confirm";
import { AuditInfo } from "@/components/ui/audit-info";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Wallet, CalendarClock, Plus, Search, Pencil, AlertTriangle, HandCoins, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

// ------------------------------------------------------------- helpers ------
// Dates here are LOCAL calendar days end to end (the backend stores and filters
// plain YYYY-MM-DD text), so never round-trip them through toISOString().

const localISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => localISO(new Date());
const monthStart = () => { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth(), 1)); };
const monthEnd = () => { const n = new Date(); return localISO(new Date(n.getFullYear(), n.getMonth() + 1, 0)); };

const TYPE_LABELS: Record<string, string> = { salary: "مرتب", rent: "إيجار", other: "أخرى" };

const STATUS_META: Record<string, { label: string; className: string }> = {
  overdue: { label: "متأخر", className: "bg-destructive text-destructive-foreground" },
  due: { label: "مستحق النهارده", className: "bg-amber-500 text-white dark:bg-amber-600" },
  soon: { label: "قرّب", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  upcoming: { label: "قادم", className: "bg-muted text-muted-foreground" },
  paid: { label: "متصرف", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

/** "2026-08" → "أغسطس 2026" */
function periodLabel(period?: string | null): string {
  if (!period) return "—";
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

const dayLabel = (d: number) => `يوم ${d} من كل شهر`;

export default function ExpensesPage() {
  // Deep link from the dashboard's due banner: /expenses?tab=monthly
  const searchString = useSearch();
  const [tab, setTab] = useState(() =>
    new URLSearchParams(searchString).get("tab") === "monthly" ? "monthly" : "log",
  );
  useEffect(() => {
    const t = new URLSearchParams(searchString).get("tab");
    if (t === "monthly" || t === "log") setTab(t);
  }, [searchString]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">المصروفات</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="log"><Wallet className="h-4 w-4 ml-2" />مصروفات دورية</TabsTrigger>
          <TabsTrigger value="monthly"><CalendarClock className="h-4 w-4 ml-2" />مصروفات شهرية</TabsTrigger>
        </TabsList>
        <TabsContent value="log"><ExpensesLogTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyExpensesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------- tab 1: the expense log ---

const EMPTY_EXPENSE = { amount: "", description: "", category: "", date: "", notes: "" };

function ExpensesLogTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_EXPENSE);

  const params = { search: search || undefined, dateFrom, dateTo, limit: 500 };
  const { data, isLoading } = useListExpenses(params, { query: { queryKey: getListExpensesQueryKey(params) } });
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const page = data as any;
  const items: any[] = page?.items || [];

  // The log and the commitments' due state read from the same rows, so any write
  // here has to refresh both tabs and the dashboard banner.
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    qc.invalidateQueries({ queryKey: getListRecurringExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetExpensesDueSummaryQueryKey() });
  };

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_EXPENSE, date: today() }); setShowForm(true); };
  const openEdit = (e: any) => {
    setEditId(e.id);
    setForm({
      amount: String(e.amount ?? ""),
      description: e.description || "",
      category: e.category || "",
      date: e.date || today(),
      notes: e.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("اكتب مبلغ أكبر من صفر"); return; }
    if (!form.description.trim()) { toast.error("اكتب المصروف ده في إيه"); return; }
    try {
      const body = {
        amount,
        description: form.description.trim(),
        category: form.category.trim() || undefined,
        date: form.date || today(),
        notes: form.notes.trim() || undefined,
      };
      if (editId) await updateExpense.mutateAsync({ id: editId, data: body });
      else await createExpense.mutateAsync({ data: body });
      invalidateAll();
      toast.success(editId ? "تم تعديل المصروف" : "تم تسجيل المصروف");
      setShowForm(false);
    } catch (e: any) {
      toast.error(e?.data?.error || "حدث خطأ، حاول مرة أخرى");
    }
  };

  const handleDelete = async (id: number) => {
    await deleteExpense.mutateAsync({ id });
    invalidateAll();
    toast.success("تم حذف المصروف");
  };

  return (
    <div className="space-y-4">
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "تعديل مصروف" : "إضافة مصروف"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>المبلغ *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>التاريخ</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>اتصرف في إيه *</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="مثال: فاتورة كهربا"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>البند</Label>
              <Input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="مثال: كهربا / مواصلات / صيانة"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={createExpense.isPending || updateExpense.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 ml-2" />إضافة مصروف</Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pr-9" placeholder="بحث في المصروفات..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">من</Label>
            <Input type="date" className="w-40" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">إلى</Label>
            <Input type="date" className="w-40" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => { setDateFrom(monthStart()); setDateTo(monthEnd()); }}>
            الشهر ده
          </Button>
        </div>
      </CardContent></Card>

      <Card className="border-primary/30">
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm text-muted-foreground">إجمالي المصروفات في الفترة المختارة</p>
            <p className="text-xs text-muted-foreground">{items.length ? `${page?.total} مصروف` : "لا توجد مصروفات"}</p>
          </div>
          <p className="text-3xl font-bold text-destructive">{formatCurrency(page?.totalAmount)}</p>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">التاريخ</th>
              <th className="p-3">اتصرف في إيه</th>
              <th className="p-3">البند</th>
              <th className="p-3 text-left">المبلغ</th>
              <th className="p-3 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              items.map((e) => (
                <tr key={e.id} className="border-b nav-hover">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{e.date}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{e.description}</span>
                      {/* A row generated by paying a monthly commitment — flagged so the
                          owner never mistakes it for something he typed by hand. */}
                      {e.recurringExpenseId && (
                        <Badge variant="secondary" className="shrink-0">
                          {TYPE_LABELS[e.recurringType] || "شهري"}
                          {e.recurringName ? ` · ${e.recurringName}` : ""}
                        </Badge>
                      )}
                    </div>
                    {e.notes && <div className="text-xs text-muted-foreground mt-0.5">{e.notes}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{e.category || "—"}</td>
                  <td className="p-3 text-left font-semibold text-destructive">{formatCurrency(e.amount)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <AuditInfo createdBy={e.createdBy} createdAt={e.createdAt} />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(e)} title="تعديل">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        entity="expenses"
                        id={e.id}
                        label={`مصروف «${e.description}»`}
                        onDelete={() => handleDelete(e.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">
                <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
                مفيش مصروفات في الفترة دي
              </td></tr>
            )}
          </tbody>
        </table>
        {/* The total above covers the WHOLE range; the table is capped. Say so rather
            than letting a truncated list read as the complete picture. */}
        {!isLoading && page?.total > items.length && (
          <p className="border-t p-3 text-center text-xs text-muted-foreground">
            معروض {items.length} من {page.total} مصروف — ضيّق الفترة أو استخدم البحث لعرض الباقي
            (الإجمالي فوق محسوب على الفترة كلها).
          </p>
        )}
      </CardContent></Card>
    </div>
  );
}

// ------------------------------------------ tab 2: the monthly commitments --

const EMPTY_COMMITMENT = {
  name: "", type: "salary", jobTitle: "", phone: "",
  amount: "", dayOfMonth: "1", startDate: "", notes: "",
};

function MonthlyExpensesTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_COMMITMENT);
  const [payTarget, setPayTarget] = useState<any>(null);

  const { data, isLoading } = useListRecurringExpenses({}, { query: { queryKey: getListRecurringExpensesQueryKey() } });
  const createCommitment = useCreateRecurringExpense();
  const updateCommitment = useUpdateRecurringExpense();
  const deleteCommitment = useDeleteRecurringExpense();

  const items: any[] = (data as any)?.items || [];
  // Anything the shop should act on now — an upcoming date later this month isn't
  // an alert yet, it's just the schedule. `dueCount`/`dueTotal` come from the server
  // and use the exact same definition as the dashboard banner, so the two agree.
  const alerts = items.filter((c) => c.dueCount > 0);
  const duePayments = alerts.reduce((s, c) => s + (c.dueCount || 0), 0);
  const dueTotal = alerts.reduce((s, c) => s + (c.dueTotal || 0), 0);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListRecurringExpensesQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/expenses"] });
    qc.invalidateQueries({ queryKey: getGetExpensesDueSummaryQueryKey() });
  };

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY_COMMITMENT, startDate: today() }); setShowForm(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      name: c.name || "",
      type: c.type || "other",
      jobTitle: c.jobTitle || "",
      phone: c.phone || "",
      amount: String(c.amount ?? ""),
      dayOfMonth: String(c.dayOfMonth ?? 1),
      startDate: c.startDate || today(),
      notes: c.notes || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    const day = parseInt(form.dayOfMonth, 10);
    if (!form.name.trim()) { toast.error("الاسم مطلوب"); return; }
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("اكتب مبلغ أكبر من صفر"); return; }
    if (!Number.isFinite(day) || day < 1 || day > 31) { toast.error("يوم الصرف لازم يكون بين 1 و 31"); return; }
    try {
      const body = {
        name: form.name.trim(),
        type: form.type as "salary" | "rent" | "other",
        jobTitle: form.jobTitle.trim() || undefined,
        phone: form.phone.trim() || undefined,
        amount,
        dayOfMonth: day,
        startDate: form.startDate || today(),
        notes: form.notes.trim() || undefined,
      };
      if (editId) await updateCommitment.mutateAsync({ id: editId, data: body });
      else await createCommitment.mutateAsync({ data: body });
      invalidateAll();
      toast.success(editId ? "تم حفظ التعديل" : "تم تسجيل الالتزام الشهري");
      setShowForm(false);
    } catch (e: any) {
      toast.error(e?.data?.error || "حدث خطأ، حاول مرة أخرى");
    }
  };

  const handleDelete = async (id: number) => {
    await deleteCommitment.mutateAsync({ id });
    invalidateAll();
    toast.success("تم الحذف/الأرشفة");
  };

  const isSalary = form.type === "salary";

  return (
    <div className="space-y-4">
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "تعديل التزام شهري" : "إضافة التزام شهري"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="salary">راتب موظف</SelectItem>
                  <SelectItem value="rent">إيجار</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={cn("space-y-1", isSalary ? "" : "col-span-2")}>
              <Label>{isSalary ? "اسم الموظف *" : "الاسم *"}</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={isSalary ? "مثال: أحمد محمد" : "مثال: إيجار المحل"}
              />
            </div>
            {/* The job title only means something for someone on the payroll. */}
            {isSalary && (
              <div className="space-y-1">
                <Label>المنصب / شغال إيه</Label>
                <Input
                  value={form.jobTitle}
                  onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                  placeholder="مثال: بائع / سائق"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>{isSalary ? "المرتب الشهري *" : "المبلغ الشهري *"}</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>يوم الصرف من كل شهر *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={e => setForm(f => ({ ...f, dayOfMonth: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>يبدأ من</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            {isSalary && (
              <div className="space-y-1">
                <Label>هاتف</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label>ملاحظات</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            يوم 29 أو 30 أو 31 بيتزحلق لآخر يوم في الشهور الأقصر.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={createCommitment.isPending || updateCommitment.isPending}>حفظ</Button>
          </div>
        </DialogContent>
      </Dialog>

      {payTarget && (
        <PayDialog
          commitment={payTarget}
          onClose={() => setPayTarget(null)}
          onPaid={invalidateAll}
        />
      )}

      <div className="flex items-center justify-end">
        <Button onClick={openAdd}><Plus className="h-4 w-4 ml-2" />إضافة التزام شهري</Button>
      </div>

      {/* Reminder strip — only rendered when something actually needs paying, so an
          all-clear month shows nothing rather than an empty "no alerts" box. */}
      {alerts.length > 0 && (
        <Card className="border-amber-400 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <CardContent className="p-4 space-y-2">
            <p className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              مصروفات مستحقة الصرف — {duePayments} دفعة بإجمالي {formatCurrency(dueTotal)}
            </p>
            {alerts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background/70 p-2">
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_META[c.status]?.className}>{STATUS_META[c.status]?.label}</Badge>
                  <span className="font-medium">{TYPE_LABELS[c.type]} {c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    عن {periodLabel(c.nextDuePeriod)} · معاده {c.nextDueDate}
                    {c.dueCount > 1 ? ` · ${c.dueCount} شهور غير متصرفة` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* The button pays ONE month (the oldest), so show that month's amount. */}
                  <span className="font-bold text-destructive">{formatCurrency(c.amount)}</span>
                  <Button size="sm" onClick={() => setPayTarget(c)}>
                    <HandCoins className="h-4 w-4 ml-1" />صرف
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الاسم</th>
              <th className="p-3">النوع</th>
              <th className="p-3">المنصب</th>
              <th className="p-3 text-left">المبلغ</th>
              <th className="p-3">معاد الصرف</th>
              <th className="p-3">حالة الشهر ده</th>
              <th className="p-3 w-40"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr> :
              items.map((c) => (
                <tr key={c.id} className="border-b nav-hover">
                  <td className="p-3">
                    <div className="font-medium">{c.name}</div>
                    {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{TYPE_LABELS[c.type] || "أخرى"}</td>
                  <td className="p-3 text-muted-foreground">{c.jobTitle || "—"}</td>
                  <td className="p-3 text-left font-semibold">{formatCurrency(c.amount)}</td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{dayLabel(c.dayOfMonth)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_META[c.status]?.className}>
                        {c.status === "paid" && <CheckCircle2 className="h-3 w-3 ml-1" />}
                        {STATUS_META[c.status]?.label || c.status}
                      </Badge>
                      {c.dueCount > 1 && (
                        <span className="text-xs text-destructive">{c.dueCount} شهور غير متصرفة</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <AuditInfo createdBy={c.createdBy} createdAt={c.createdAt} updatedAt={c.updatedAt} />
                      <Button
                        size="sm"
                        variant={c.status === "paid" ? "outline" : "default"}
                        onClick={() => setPayTarget(c)}
                        disabled={c.pendingCount === 0}
                        title={c.pendingCount === 0 ? "مفيش شهور مستحقة دلوقتي" : "تسجيل صرف"}
                      >
                        <HandCoins className="h-4 w-4 ml-1" />صرف
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)} title="تعديل">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <DeleteButton
                        entity="recurring-expenses"
                        id={c.id}
                        label={`«${c.name}»`}
                        onDelete={() => handleDelete(c.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                <CalendarClock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                مفيش التزامات شهرية مسجلة — ضيف مرتب موظف أو إيجار وهنفكّرك كل شهر
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

/**
 * Records a payment against a commitment. The month is chosen explicitly (defaulting
 * to the oldest one still owed) because a shop that pays September's rent in October
 * must be able to say so — otherwise the backlog never clears.
 */
function PayDialog({ commitment, onClose, onPaid }: { commitment: any; onClose: () => void; onPaid: () => void }) {
  const [amount, setAmount] = useState(String(commitment.amount ?? ""));
  const [date, setDate] = useState(today);
  const [periodKey, setPeriodKey] = useState(commitment.nextDuePeriod || commitment.currentPeriod);
  const [notes, setNotes] = useState("");
  const pay = usePayRecurringExpense();

  const handlePay = async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) { toast.error("اكتب مبلغ أكبر من صفر"); return; }
    try {
      await pay.mutateAsync({ id: commitment.id, data: { amount: value, date, periodKey, notes: notes.trim() || undefined } });
      onPaid();
      toast.success(`تم صرف ${TYPE_LABELS[commitment.type]} ${commitment.name} عن ${periodLabel(periodKey)}`);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.error || "تعذّر تسجيل الصرف");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>صرف {TYPE_LABELS[commitment.type]} — {commitment.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>عن شهر</Label>
            <Input type="month" value={periodKey} onChange={e => setPeriodKey(e.target.value)} />
            <p className="text-xs text-muted-foreground">{periodLabel(periodKey)}</p>
          </div>
          <div className="space-y-1">
            <Label>المبلغ *</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>تاريخ الصرف</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            هيتسجّل تلقائياً في «مصروفات دورية» ضمن إجمالي مصروفات الشهر.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handlePay} disabled={pay.isPending}>
            <HandCoins className="h-4 w-4 ml-2" />تأكيد الصرف
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
