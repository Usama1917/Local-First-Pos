import { useEffect, useState } from "react";
import { LogOut, Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageDef } from "@/lib/pages";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function Layout({ children, userName, pages, onLogout }: { children: React.ReactNode; userName?: string; pages: PageDef[]; onLogout?: () => void }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const navigation = (mobile = false) => (
    <nav aria-label="القائمة الرئيسية" className="min-h-0 flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
      {pages.map((item) => {
        const isActive = location === item.key || (item.key !== "/" && location.startsWith(item.key));
        return (
          <Link key={item.key} href={item.key} aria-current={isActive ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
            className={cn("relative flex min-h-11 shrink-0 items-center gap-3 px-3 py-2 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground")}>
            {isActive && <motion.div layoutId={mobile ? "mobileNavHighlight" : "activeNavHighlight"}
              className="absolute inset-0 rounded-md bg-primary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
            <item.icon className="relative z-10 h-5 w-5 shrink-0" />
            <span className="relative z-10 font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="app-shell flex h-dvh bg-background">
      {/* Sidebar */}
      <div className="hidden w-64 shrink-0 border-l bg-card lg:flex flex-col no-print">
        <div className="h-16 flex items-center px-6 border-b text-primary font-bold text-xl">
          إدارة المتجر
        </div>
        {navigation()}
      </div>

      {/* Main Content */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <header className="app-header min-h-16 shrink-0 border-b bg-card flex items-center gap-2 px-3 sm:gap-4 sm:px-6 no-print">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 lg:hidden" aria-label="فتح القائمة الرئيسية"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="mobile-navigation flex flex-col gap-0 p-0" aria-describedby={undefined}>
              <SheetTitle className="border-b py-5 pr-5 pl-16 text-right">إدارة المتجر</SheetTitle>
              {navigation(true)}
            </SheetContent>
          </Sheet>
          <span className="min-w-0 truncate font-semibold lg:hidden">{pages.find(p => p.key === location)?.label || "إدارة المتجر"}</span>
          <div className="hidden lg:block text-sm font-medium text-muted-foreground">
            {new Date().toLocaleDateString("ar-EG", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex-1" />
          {userName && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{userName}</span>
              {onLogout && (
                <Button variant="ghost" size="sm" onClick={onLogout} aria-label="تسجيل الخروج">
                  <LogOut className="h-4 w-4 ml-1" />
                  خروج
                </Button>
              )}
            </div>
          )}
        </header>
        <main className="app-main min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6 page-pattern-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
