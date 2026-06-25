import { useState, type FormEvent } from "react";
import { useLogin } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Store, Lock } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage({ onLogin }: { onLogin: (user: any) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!username || !password) {
      toast.error("أدخل اسم المستخدم وكلمة المرور");
      return;
    }
    try {
      const user = await login.mutateAsync({ data: { username, password } });
      onLogin(user);
    } catch {
      toast.error("اسم المستخدم أو كلمة المرور غير صحيحة");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="p-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Store className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">نظام إدارة المتجر</h1>
            <p className="text-sm text-muted-foreground">سجّل الدخول للمتابعة</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label>اسم المستخدم</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            </div>
            <div className="space-y-1">
              <Label>كلمة المرور</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              <Lock className="h-4 w-4 ml-2" />
              {login.isPending ? "جاري الدخول..." : "دخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
