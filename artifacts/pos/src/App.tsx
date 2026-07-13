import { useState } from "react";
import { Switch, Route, Redirect, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import { allowedPages, type SessionUser } from "@/lib/pages";
import { setActorHeaderGetter } from "@workspace/api-client-react";

// Attach the logged-in user's name to every API request (X-Actor-Name header) so
// the backend records who created / modified each record. Reads localStorage each
// time so it always reflects the current session (and survives login/logout).
setActorHeaderGetter(() => {
  try {
    return JSON.parse(localStorage.getItem("pos_user") || "null");
  } catch {
    return null;
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

function Router({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
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

  if (!user) {
    return <LoginPage onLogin={(u) => { localStorage.setItem("pos_user", JSON.stringify(u)); setUser(u); }} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router
        user={user}
        onLogout={() => { localStorage.removeItem("pos_user"); setUser(null); }}
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
