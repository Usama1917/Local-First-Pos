import { LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PageDef } from "@/lib/pages";

export function Layout({ children, userName, pages, onLogout }: { children: React.ReactNode; userName?: string; pages: PageDef[]; onLogout?: () => void }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-l bg-card flex flex-col no-print">
        <div className="h-16 flex items-center px-6 border-b text-primary font-bold text-xl">
          إدارة المتجر
        </div>
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
          {pages.map((item) => {
            const isActive = location === item.key || (item.key !== "/" && location.startsWith(item.key));
            return (
              <Link key={item.key} href={item.key}>
                <div
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors",
                    isActive
                      ? "text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavHighlight"
                      className="absolute inset-0 rounded-md bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <item.icon className="relative z-10 h-5 w-5" />
                  <span className="relative z-10 font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b bg-card flex items-center gap-4 px-6 no-print">
          <div className="text-sm font-medium text-muted-foreground">
            {new Date().toLocaleDateString("ar-EG", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <div className="flex-1" />
          {userName && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{userName}</span>
              {onLogout && (
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  <LogOut className="h-4 w-4 ml-1" />
                  خروج
                </Button>
              )}
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6 page-pattern-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
