import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

import Dashboard from "@/pages/dashboard";
import POSPage from "@/pages/pos";
import QuotationsPage from "@/pages/quotations";
import SalesPage from "@/pages/sales";
import PurchasesPage from "@/pages/purchases";
import ProductsPage from "@/pages/products";
import InventoryPage from "@/pages/inventory";
import CustomersPage from "@/pages/customers";
import CraftsmenPage from "@/pages/craftsmen";
import SuppliersPage from "@/pages/suppliers";
import DebtsPage from "@/pages/debts";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router({ userName, onLogout }: { userName?: string; onLogout?: () => void }) {
  return (
    <Layout userName={userName} onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pos" component={POSPage} />
        <Route path="/quotations" component={QuotationsPage} />
        <Route path="/sales" component={SalesPage} />
        <Route path="/purchases" component={PurchasesPage} />
        <Route path="/products" component={ProductsPage} />
        <Route path="/inventory" component={InventoryPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/craftsmen" component={CraftsmenPage} />
        <Route path="/suppliers" component={SuppliersPage} />
        <Route path="/debts" component={DebtsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AuthGate() {
  const [user, setUser] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem("pos_user") || "null"); } catch { return null; }
  });

  if (!user) {
    return <LoginPage onLogin={(u) => { localStorage.setItem("pos_user", JSON.stringify(u)); setUser(u); }} />;
  }

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router
        userName={user.name}
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
          <Toaster position="top-center" richColors expand={false} duration={3000} />
        </TooltipProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}

export default App;
