import { useState, useEffect } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  useCreateBackup,
  useListBackups,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/format";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { getHighlightColor, setHighlightColor, HIGHLIGHT_COLORS } from "@/lib/highlight-color";
import { motion } from "framer-motion";
import { Save, Download, HardDrive, Settings, FolderOpen, Sun, Moon, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();
  const createBackup = useCreateBackup();
  const { data: backups } = useListBackups();
  const { data: dbInfo } = useQuery({ queryKey: ["backup-info"], queryFn: () => fetch("/api/backup/info").then(r => r.json()) });
  const [newDataDir, setNewDataDir] = useState("");
  const [newArchiveDir, setNewArchiveDir] = useState("");
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const changeTheme = (t: Theme) => { setTheme(t); setThemeState(t); };
  const [highlight, setHighlightState] = useState<string>(getHighlightColor());
  const changeHighlight = (k: string) => { setHighlightColor(k); setHighlightState(k); };
  // Shop's custom sale terms, edited as a list; stored as one term per line.
  const [terms, setTerms] = useState<string[]>([]);
  const addTerm = () => setTerms((t) => [...t, ""]);
  const updateTerm = (i: number, v: string) => setTerms((t) => t.map((x, idx) => (idx === i ? v : x)));
  const removeTerm = (i: number) => setTerms((t) => t.filter((_, idx) => idx !== i));
  const s = settings as any;

  const [form, setForm] = useState<any>({
    shopName: "", shopPhone: "", shopAddress: "", currency: "EGP",
    defaultPrintTemplate: "a4", lowStockThreshold: 5,
    enableCraftsmanCommission: true, enableDarkMode: false,
    invoicePrefix: "INV", quotationPrefix: "QUO", purchasePrefix: "PUR",
  });

  useEffect(() => {
    if (s) {
      setForm({
        shopName: s.shopName || "",
        shopPhone: s.shopPhone || "",
        shopAddress: s.shopAddress || "",
        currency: s.currency || "EGP",
        defaultPrintTemplate: s.defaultPrintTemplate || "a4",
        lowStockThreshold: s.lowStockThreshold || 5,
        enableCraftsmanCommission: !!s.enableCraftsmanCommission,
        enableDarkMode: !!s.enableDarkMode,
        invoicePrefix: s.invoicePrefix || "INV",
        quotationPrefix: s.quotationPrefix || "QUO",
        purchasePrefix: s.purchasePrefix || "PUR",
      });
      setTerms(s.invoiceTerms ? String(s.invoiceTerms).split("\n") : []);
    }
  }, [s]);

  const handleSave = async () => {
    try {
      const invoiceTerms = terms.map((t) => t.trim()).filter(Boolean).join("\n");
      await updateSettings.mutateAsync({ data: { ...form, invoiceTerms } });
      qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      toast.success("تم حفظ الإعدادات");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ الإعدادات");
    }
  };

  const triggerDownload = (filename: string) => {
    const a = document.createElement("a");
    a.href = `/api/backup/download/${encodeURIComponent(filename)}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleBackup = async () => {
    const r: any = await createBackup.mutateAsync();
    qc.invalidateQueries();
    toast.success("تم إنشاء النسخة الاحتياطية");
    if (r?.filename) triggerDownload(r.filename); // browser asks where to save
  };

  const saveDataDir = async () => {
    if (!newDataDir.trim()) { toast.error("اكتب أو اختر مسار المجلد"); return; }
    const res = await fetch("/api/backup/data-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: newDataDir.trim() }),
    });
    if (res.ok) { toast.success("تم الحفظ — أعد تشغيل البرنامج لتطبيق المكان الجديد"); setNewDataDir(""); }
    else toast.error("تعذّر الحفظ");
  };

  // Open the native folder picker on the shop PC and fill the given field.
  const browseFolder = async (setter: (v: string) => void) => {
    try {
      const r = await fetch("/api/backup/pick-folder", { method: "POST" }).then((x) => x.json());
      if (r?.path) setter(r.path);
    } catch { toast.error("تعذّر فتح نافذة التصفّح"); }
  };

  const saveArchiveDir = async () => {
    if (!newArchiveDir.trim()) { toast.error("اكتب أو اختر مجلد الأرشفة"); return; }
    const res = await fetch("/api/backup/archive-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir: newArchiveDir.trim() }),
    });
    if (res.ok) { toast.success("تم حفظ مكان الأرشفة"); setNewArchiveDir(""); qc.invalidateQueries({ queryKey: ["backup-info"] }); }
    else toast.error("تعذّر الحفظ");
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الإعدادات</h1>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">عام</TabsTrigger>
          <TabsTrigger value="numbering">الترقيم</TabsTrigger>
          <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>بيانات المحل</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1"><Label>اسم المحل</Label><Input value={form.shopName} onChange={e => setForm((f: any) => ({ ...f, shopName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>رقم الهاتف</Label><Input value={form.shopPhone} onChange={e => setForm((f: any) => ({ ...f, shopPhone: e.target.value }))} /></div>
              <div className="space-y-1"><Label>العنوان</Label><Input value={form.shopAddress} onChange={e => setForm((f: any) => ({ ...f, shopAddress: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label>قالب الطباعة الافتراضي</Label>
                <Select value={form.defaultPrintTemplate} onValueChange={v => setForm((f: any) => ({ ...f, defaultPrintTemplate: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a4">A4</SelectItem>
                    <SelectItem value="a5">A5</SelectItem>
                    <SelectItem value="thermal">حراري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>حد نفاد المخزون</Label>
                <Input type="number" value={form.lowStockThreshold} onChange={e => setForm((f: any) => ({ ...f, lowStockThreshold: parseInt(e.target.value) || 5 }))} className="w-32" />
              </div>
              <div className="flex items-center justify-between">
                <Label>تفعيل عمولة الصنايعية</Label>
                <Switch checked={form.enableCraftsmanCommission} onCheckedChange={v => setForm((f: any) => ({ ...f, enableCraftsmanCommission: v }))} />
              </div>

              <div className="space-y-2 border-t pt-4">
                <div>
                  <Label>بنود / شروط الفاتورة</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    بتظهر في أسفل كل فاتورة قبل خانة التوقيع (بأي مقاس طباعة: A4 / A5 / حراري). مثال: «البضاعة المباعة لا تُستبدل بعد 15 يوم».
                  </p>
                </div>
                {terms.length > 0 && (
                  <div className="space-y-2">
                    {terms.map((t, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5 text-center shrink-0">{i + 1}.</span>
                        <Input
                          value={t}
                          onChange={e => updateTerm(i, e.target.value)}
                          placeholder="اكتب البند هنا..."
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeTerm(i)} aria-label="حذف البند" className="shrink-0 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={addTerm}>
                  <Plus className="h-4 w-4 ml-1" /> إضافة بند
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>المظهر</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>مظهر النظام</Label>
                  <p className="text-xs text-muted-foreground mt-1">اختَر بين الوضع الفاتح والداكن — بيتطبّق على طول.</p>
                </div>
                <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
                  {(["light", "dark"] as Theme[]).map((t) => {
                    const active = theme === t;
                    const Icon = t === "light" ? Sun : Moon;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => changeTheme(t)}
                        className={`relative flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium outline-none transition-colors ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {active && (
                          <motion.span
                            layoutId="theme-toggle-pill"
                            className="absolute inset-0 rounded-md bg-primary shadow-sm"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        <motion.span
                          className="relative z-10 inline-flex"
                          animate={active ? { rotate: [0, -20, 0], scale: [1, 1.25, 1] } : { rotate: 0, scale: 1 }}
                          whileTap={{ scale: 0.8 }}
                          transition={{ duration: 0.45 }}
                        >
                          <Icon className="h-4 w-4" />
                        </motion.span>
                        <span className="relative z-10">{t === "light" ? "فاتح" : "داكن"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-4 border-t pt-6">
                <div>
                  <Label>لون التحديد</Label>
                  <p className="text-xs text-muted-foreground mt-1">لون تظليل العنصر المحدَّد أثناء التنقّل بالكيبورد أو بالماوس في نتائج البحث والجداول.</p>
                </div>
                <Select value={highlight} onValueChange={changeHighlight}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HIGHLIGHT_COLORS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: `hsl(${c.hsl})` }} />
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="numbering">
          <Card>
            <CardHeader><CardTitle>بادئات الترقيم</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>بادئة فواتير المبيعات</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.invoicePrefix} onChange={e => setForm((f: any) => ({ ...f, invoicePrefix: e.target.value }))} className="w-24" />
                  <span className="text-muted-foreground text-sm">مثال: {form.invoicePrefix}-{new Date().getFullYear()}-000001</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>بادئة التسعيرات</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.quotationPrefix} onChange={e => setForm((f: any) => ({ ...f, quotationPrefix: e.target.value }))} className="w-24" />
                  <span className="text-muted-foreground text-sm">مثال: {form.quotationPrefix}-{new Date().getFullYear()}-000001</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label>بادئة فواتير المشتريات</Label>
                <div className="flex items-center gap-2">
                  <Input value={form.purchasePrefix} onChange={e => setForm((f: any) => ({ ...f, purchasePrefix: e.target.value }))} className="w-24" />
                  <span className="text-muted-foreground text-sm">مثال: {form.purchasePrefix}-{new Date().getFullYear()}-000001</span>
                </div>
              </div>
              <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground">
                <p>عداد الفواتير الحالي: {s?.invoiceCounter}</p>
                <p>عداد التسعيرات الحالي: {s?.quotationCounter}</p>
                <p>عداد المشتريات الحالي: {s?.purchaseCounter}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>النسخ الاحتياطي والاستعادة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button onClick={handleBackup} disabled={createBackup.isPending}>
                  <Download className="h-4 w-4 ml-2" />
                  {createBackup.isPending ? "جاري الإنشاء..." : "إنشاء نسخة احتياطية"}
                </Button>
              </div>
              {s?.lastBackupAt && (
                <p className="text-sm text-muted-foreground">آخر نسخة: {new Date(s.lastBackupAt).toLocaleString("ar-EG")}</p>
              )}
              <div>
                <h3 className="font-semibold mb-2">النسخ المتاحة</h3>
                <div className="space-y-2">
                  {(backups as any[])?.map((b: any) => (
                    <div key={b.filename} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                      <div className="flex items-center gap-3">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{b.filename}</p>
                          <p className="text-xs text-muted-foreground">{new Date(b.createdAt).toLocaleString("ar-EG")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">{(b.size / 1024).toFixed(1)} KB</span>
                        <Button variant="outline" size="sm" onClick={() => triggerDownload(b.filename)}>
                          <Download className="h-3.5 w-3.5 ml-1" /> تنزيل
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!(backups as any[])?.length && <p className="text-sm text-muted-foreground">لا توجد نسخ احتياطية</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>مكان حفظ قاعدة البيانات</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">المكان الحالي لقاعدة البيانات:</p>
                <p className="font-mono text-xs break-all text-muted-foreground">{(dbInfo as any)?.dbPath || "..."}</p>
                <p className="mt-2 font-medium">مجلد النسخ الاحتياطية:</p>
                <p className="font-mono text-xs break-all text-muted-foreground">{(dbInfo as any)?.backupDir || "..."}</p>
              </div>
              <div className="space-y-1">
                <Label>تغيير مكان حفظ البيانات (مسار مجلد)</Label>
                <div className="flex gap-2">
                  <Input placeholder="مثال: D:\POS-Data" value={newDataDir} onChange={e => setNewDataDir(e.target.value)} />
                  <Button variant="outline" onClick={() => browseFolder(setNewDataDir)}><FolderOpen className="h-4 w-4 ml-1" />تصفّح</Button>
                  <Button variant="outline" onClick={saveDataDir}>حفظ المكان</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  ⚠️ يتطلب إعادة تشغيل البرنامج. لو عندك بيانات قديمة، انقل ملف <span className="font-mono">store.db</span> للمكان الجديد قبل التشغيل.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>أرشفة الفواتير تلقائيًا (PDF)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                لما تختار مجلد هنا، كل فاتورة (بيع / مشتريات / مرتجع / سحب عمولة) هتتحفظ تلقائيًا كملف PDF بداخله، منظّمة في فولدرات:
                <span className="font-medium"> العملاء</span> (فولدر لكل عميل)،
                <span className="font-medium"> الصنايعية</span> (إيصالات السحب)،
                <span className="font-medium"> المشتريات</span> (فواتير الشراء).
              </p>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="font-medium">مجلد الأرشفة الحالي:</p>
                <p className="font-mono text-xs break-all text-muted-foreground">{(dbInfo as any)?.archiveDir || "غير مفعّل"}</p>
              </div>
              <div className="space-y-1">
                <Label>مجلد حفظ الفواتير</Label>
                <div className="flex gap-2">
                  <Input placeholder="مثال: D:\POS-Invoices" value={newArchiveDir} onChange={e => setNewArchiveDir(e.target.value)} />
                  <Button variant="outline" onClick={() => browseFolder(setNewArchiveDir)}><FolderOpen className="h-4 w-4 ml-1" />تصفّح</Button>
                  <Button variant="outline" onClick={saveArchiveDir}>حفظ المكان</Button>
                </div>
                <p className="text-xs text-muted-foreground">✅ يُطبَّق فورًا — مش محتاج إعادة تشغيل. الفواتير القديمة متتأرشفش، بس اللي جاي.</p>
                {(dbInfo as any)?.pdfEngineAvailable === false && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ مفيش متصفّح (Edge/Chrome) متثبّت على الجهاز — مطلوب لإنشاء ملفات الـ PDF.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button size="lg" onClick={handleSave} disabled={updateSettings.isPending}>
        <Save className="h-4 w-4 ml-2" />
        حفظ الإعدادات
      </Button>
    </div>
  );
}
