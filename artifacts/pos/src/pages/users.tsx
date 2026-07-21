import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignablePages } from "@/lib/pages";
import { UserCog, Plus, Pencil, Trash2, Eye, EyeOff, ShieldCheck, KeyRound } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = { admin: "مدير", staff: "موظف", cashier: "موظف" };

function roleIsAdmin(role: string) { return role === "admin"; }

// ── Permissions dialog: toggle which pages a (non-admin) user can open ──
function PermissionsDialog({ user, onClose }: { user: any; onClose: () => void }) {
  const qc = useQueryClient();
  const updateUser = useUpdateUser();
  const pages = assignablePages();
  const [enabled, setEnabled] = useState<Set<string>>(new Set(Array.isArray(user.permissions) ? user.permissions : []));
  const admin = roleIsAdmin(user.role);

  const toggle = (key: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const save = async () => {
    try {
      await updateUser.mutateAsync({ id: user.id, data: { permissions: Array.from(enabled) } });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast.success("تم حفظ الصلاحيات");
      onClose();
    } catch (e: any) { toast.error(e?.message || "خطأ"); }
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />صلاحيات: {user.name}</DialogTitle>
      </DialogHeader>
      {admin ? (
        <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
          المدير له صلاحية الوصول لكل الصفحات تلقائيًا — مفيش حاجة تتحدد هنا.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">الصفحات المفعّلة بس هي اللي هتظهر لليوزر دا وهو داخل بحسابه.</p>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setEnabled(new Set(pages.map((p) => p.key)))}>تحديد الكل</Button>
              <Button size="sm" variant="ghost" onClick={() => setEnabled(new Set())}>مسح الكل</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {pages.map((p) => {
              const on = enabled.has(p.key);
              return (
                <label
                  key={p.key}
                  className={`flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${on ? "border-primary/40 bg-primary/5" : "nav-hover"}`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium">
                    <p.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    {p.label}
                  </span>
                  <Switch checked={on} onCheckedChange={() => toggle(p.key)} className="shrink-0" />
                </label>
              );
            })}
          </div>
        </>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إغلاق</Button>
        {!admin && <Button onClick={save} disabled={updateUser.isPending}>حفظ الصلاحيات</Button>}
      </DialogFooter>
    </DialogContent>
  );
}

// ── Add / edit user dialog ──
function UserFormDialog({ user, onClose, onCreated }: { user: any | null; onClose: () => void; onCreated?: (u: any) => void }) {
  const qc = useQueryClient();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || "",
    name: user?.name || "",
    password: isEdit ? "" : "",
    role: user ? (roleIsAdmin(user.role) ? "admin" : "staff") : "staff",
    isActive: user ? !!user.isActive : true,
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.username || !form.name) { toast.error("الاسم واسم المستخدم مطلوبين"); return; }
    if (!isEdit && !form.password) { toast.error("اكتب كلمة المرور"); return; }
    try {
      if (isEdit) {
        await updateUser.mutateAsync({
          id: user.id,
          data: {
            username: form.username,
            name: form.name,
            role: form.role,
            isActive: form.isActive,
            ...(form.password ? { password: form.password } : {}),
          },
        });
        toast.success("تم حفظ التعديلات");
      } else {
        const created = await createUser.mutateAsync({
          data: { username: form.username, name: form.name, password: form.password, role: form.role, permissions: [] },
        });
        toast.success("تم إضافة المستخدم");
        onCreated?.(created);
      }
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      onClose();
    } catch (e: any) { toast.error(e?.message || "خطأ"); }
  };

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader><DialogTitle>{isEdit ? "تعديل مستخدم" : "إضافة مستخدم"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1"><Label>الاسم *</Label><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div className="space-y-1"><Label>اسم المستخدم *</Label><Input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" /></div>
        <div className="space-y-1">
          <Label>{isEdit ? "كلمة مرور جديدة (اتركها فارغة لو مش هتتغير)" : "كلمة المرور *"}</Label>
          <Input value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" placeholder={isEdit ? "••••••" : ""} />
        </div>
        <div className="space-y-1">
          <Label>الصلاحية</Label>
          <Select value={form.role} onValueChange={(v) => set("role", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">مدير (كل الصلاحيات)</SelectItem>
              <SelectItem value="staff">موظف (صلاحيات محددة)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isEdit && (
          <label className="flex items-center justify-between rounded-md border p-2.5">
            <span className="text-sm font-medium">الحساب مفعّل</span>
            <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
          </label>
        )}
        {form.role === "staff" && !isEdit && (
          <p className="text-xs text-muted-foreground">بعد الإضافة هتفتح نافذة الصلاحيات تلقائيًا عشان تحدد الصفحات.</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button onClick={submit} disabled={createUser.isPending || updateUser.isPending}>{isEdit ? "حفظ" : "إضافة"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  const deleteUser = useDeleteUser();
  const users = (data as any)?.items || [];

  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [permsUser, setPermsUser] = useState<any | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const openAdd = () => { setEditUser(null); setShowForm(true); };
  const openEdit = (u: any) => { setEditUser(u); setShowForm(true); };

  const handleDelete = async (u: any) => {
    if (!window.confirm(`متأكد إنك عايز تحذف المستخدم "${u.name}"؟`)) return;
    try {
      await deleteUser.mutateAsync({ id: u.id });
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast.success("تم حذف المستخدم");
    } catch (e: any) { toast.error(e?.message || "خطأ"); }
  };

  return (
    <div className="space-y-4">
      {/* add / edit */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) setShowForm(false); }}>
        {showForm && (
          <UserFormDialog
            user={editUser}
            onClose={() => setShowForm(false)}
            onCreated={(u) => { if (!roleIsAdmin(u.role)) setPermsUser(u); }}
          />
        )}
      </Dialog>
      {/* permissions */}
      <Dialog open={!!permsUser} onOpenChange={(o) => { if (!o) setPermsUser(null); }}>
        {permsUser && <PermissionsDialog key={permsUser.id} user={permsUser} onClose={() => setPermsUser(null)} />}
      </Dialog>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="h-6 w-6" />المستخدمين</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4 ml-2" />إضافة مستخدم</Button>
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-right">
              <th className="p-3">الاسم</th>
              <th className="p-3">اسم المستخدم</th>
              <th className="p-3">كلمة المرور</th>
              <th className="p-3">الصلاحية</th>
              <th className="p-3">الحالة</th>
              <th className="p-3 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل...</td></tr>
            ) : users.map((u: any) => (
              <tr key={u.id} className="border-b nav-hover">
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3 font-mono text-muted-foreground">{u.username}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{revealed[u.id] ? u.password : "••••••"}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRevealed((r) => ({ ...r, [u.id]: !r[u.id] }))} title={revealed[u.id] ? "إخفاء" : "إظهار"}>
                      {revealed[u.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </td>
                <td className="p-3">
                  <Badge variant={roleIsAdmin(u.role) ? "default" : "secondary"}>{ROLE_LABEL[u.role] || u.role}</Badge>
                </td>
                <td className="p-3">
                  {u.isActive ? <span className="text-emerald-600 dark:text-emerald-400 text-xs">مفعّل</span> : <span className="text-muted-foreground text-xs">موقوف</span>}
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => setPermsUser(u)} disabled={roleIsAdmin(u.role)} title={roleIsAdmin(u.role) ? "المدير له كل الصلاحيات" : "تحديد الصفحات"}>
                      <ShieldCheck className="h-4 w-4 ml-1" />صلاحيات
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)} title="تعديل"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(u)} title="حذف"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">
                <KeyRound className="h-10 w-10 mx-auto mb-2 opacity-30" />لا يوجد مستخدمون
              </td></tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
