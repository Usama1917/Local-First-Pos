import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import NotFound from "@/pages/not-found";

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

function Router() {
  return (
    <Layout>
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster position="top-center" richColors expand={false} duration={3000} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
