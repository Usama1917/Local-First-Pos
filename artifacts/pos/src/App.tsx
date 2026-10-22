import { useEffect, useState } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import { allowedPages, type SessionUser } from "@/lib/pages";
import { setActorHeaderGetter, setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

function readStoredUser(): any {
  try {
    return JSON.parse(localStorage.getItem("pos_user") || "null");
  } catch {
    return null;
  }
}

// Attach the logged-in user's name to every API request (X-Actor-Name header) so
// the backend records who created / modified each record. Reads localStorage each
// time so it always reflects the current session (and survives login/logout).
setActorHeaderGetter(readStoredUser);

// Attach the server-issued session token (Authorization: Bearer) to every request.
setAuthTokenGetter(() => readStoredUser()?.token ?? null);

// Any 401 (expired/missing session — e.g. an upgraded install whose stored user
// predates tokens) drops the stale local session and returns to login. Guarded by
// pos_user so a failed login attempt (no session yet) doesn't trigger a reload loop.
setUnauthorizedHandler(() => {
  if (localStorage.getItem("pos_user")) {
    localStorage.removeItem("pos_user");
    window.location.reload();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router({ user, onLogout }: { user: SessionUser; onLogout?: () => void }) {
  const pages = allowedPages(user);

  if (pages.length === 0) {
    return (
      <Layout userName={user.name} pages={[]} onLogout={onLogout}>
        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
          <div>
            <p className="text-lg font-semibold">لا توجد صلاحيات</p>
            <p className="text-sm">حسابك ليس له صلاحية لأي صفحة. راجع مدير النظام.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const fallback = pages[0].key;
  return (
    <Layout userName={user.name} pages={pages} onLogout={onLogout}>
      <Switch>
        {pages.map((p) => (
          <Route key={p.key} path={p.key} component={p.component} />
        ))}
        {/* Any other path (unknown, or one this user may not open) → first allowed page. */}
        <Route><Redirect to={fallback} /></Route>
      </Switch>
    </Layout>
  );
}

function AuthGate() {
  const [authEnabled, setAuthEnabled] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const u = JSON.parse(localStorage.getItem("pos_user") || "null");
      // A cached non-admin session from before per-page permissions existed would
      // otherwise resolve to "no pages" and dead-end. Force a fresh login so it
      // picks up its real permissions.
      if (u && u.role !== "admin" && !Array.isArray(u.permissions)) {
        localStorage.removeItem("pos_user");
        return null;
      }
      return u;
    } catch { return null; }
  });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/config")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not read auth configuration");
        return response.json() as Promise<{ authEnabled?: boolean }>;
      })
      .then((config) => {
        if (!active) return;
        const enabled = config.authEnabled === true;
        setAuthEnabled(enabled);
        if (!enabled) {
          // Keep client-side page visibility in sync with the server's open mode.
          const openUser: SessionUser = { id: 0, username: "", name: "", role: "admin", permissions: [] };
          localStorage.setItem("pos_user", JSON.stringify(openUser));
          setUser(openUser);
        }
      })
      // If the API cannot be reached, don't expose the UI just because we could
      // not read its security setting.
      .catch(() => { if (active) setAuthEnabled(true); });
    return () => { active = false; };
  }, []);

  if (authEnabled === null) {
    return <div className="min-h-dvh bg-background" aria-label="جاري تجهيز النظام" />;
  }

  if (authEnabled && !user) {
    return <LoginPage onLogin={(u) => { localStorage.setItem("pos_user", JSON.stringify(u)); setUser(u); }} />;
  }

  // Open mode always sets the virtual administrator above before rendering.
  if (!user) return null;

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router
        user={user}
        onLogout={authEnabled ? () => {
          const token = readStoredUser()?.token;
          // Capture the token before clearing storage; revoke it server-side too.
          if (token) void fetch("/api/auth/logout", {
            method: "POST", headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
          localStorage.removeItem("pos_user");
          queryClient.clear();
          setUser(null);
        } : undefined}
      />
    </WouterRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir="rtl">
        <TooltipProvider>
          <AuthGate />
          <Toaster
            position="top-left"
            dir="rtl"
            richColors
            expand={false}
            duration={3000}
            toastOptions={{ className: "app-toast", style: { fontFamily: "var(--app-font-sans)", fontSize: "0.95rem" } }}
          />
        </TooltipProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}

export default App;
