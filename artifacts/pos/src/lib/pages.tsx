import type { ComponentType } from "react";
import {
  LayoutDashboard, ShoppingCart, FileText, Receipt, RotateCcw, ShoppingBag,
  Package, ClipboardList, Users, HardHat, Truck, CreditCard, BarChart3, Settings, UserCog,
  type LucideIcon,
} from "lucide-react";

import Dashboard from "@/pages/dashboard";
import POSPage from "@/pages/pos";
import QuotationsPage from "@/pages/quotations";
import SalesPage from "@/pages/sales";
import ReturnsPage from "@/pages/returns";
import PurchasesPage from "@/pages/purchases";
import ProductsPage from "@/pages/products";
import InventoryPage from "@/pages/inventory";
import CustomersPage from "@/pages/customers";
import CraftsmenPage from "@/pages/craftsmen";
import SuppliersPage from "@/pages/suppliers";
import DebtsPage from "@/pages/debts";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import UsersPage from "@/pages/users";

export interface PageDef {
  /** Route path — also the stable permission key. */
  key: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
  /** Admins only; never grantable to a normal user and hidden from them entirely. */
  adminOnly?: boolean;
}

// Single source of truth for nav items, routes, and the permissions dialog.
export const PAGES: PageDef[] = [
  { key: "/", label: "لوحة التحكم", icon: LayoutDashboard, component: Dashboard },
  { key: "/pos", label: "الكاشير", icon: ShoppingCart, component: POSPage },
  { key: "/quotations", label: "التسعيرات", icon: FileText, component: QuotationsPage },
  { key: "/sales", label: "الفواتير", icon: Receipt, component: SalesPage },
  { key: "/returns", label: "المرتجعات والاستبدال", icon: RotateCcw, component: ReturnsPage },
  { key: "/purchases", label: "المشتريات", icon: ShoppingBag, component: PurchasesPage },
  { key: "/products", label: "المنتجات", icon: Package, component: ProductsPage },
  { key: "/inventory", label: "المخزن", icon: ClipboardList, component: InventoryPage },
  { key: "/customers", label: "العملاء", icon: Users, component: CustomersPage },
  { key: "/craftsmen", label: "الصنايعية", icon: HardHat, component: CraftsmenPage },
  { key: "/suppliers", label: "الموردين والماركات", icon: Truck, component: SuppliersPage },
  { key: "/debts", label: "المديونيات", icon: CreditCard, component: DebtsPage },
  { key: "/reports", label: "التقارير", icon: BarChart3, component: ReportsPage },
  { key: "/settings", label: "الإعدادات", icon: Settings, component: SettingsPage },
  { key: "/users", label: "المستخدمين", icon: UserCog, component: UsersPage, adminOnly: true },
];

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: string;
  permissions?: string[] | null;
}

export function isAdmin(u?: SessionUser | null): boolean {
  return u?.role === "admin";
}

export function canAccess(u: SessionUser | null | undefined, key: string): boolean {
  if (!u) return false;
  const page = PAGES.find((p) => p.key === key);
  if (page?.adminOnly) return isAdmin(u);
  if (isAdmin(u)) return true;
  const perms = Array.isArray(u.permissions) ? u.permissions : [];
  return perms.includes(key);
}

export function allowedPages(u: SessionUser | null | undefined): PageDef[] {
  return PAGES.filter((p) => canAccess(u, p.key));
}

/** Pages a manager can grant to a non-admin user (everything except admin-only). */
export function assignablePages(): PageDef[] {
  return PAGES.filter((p) => !p.adminOnly);
}
