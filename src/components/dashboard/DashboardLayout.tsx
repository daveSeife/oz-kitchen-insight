import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAdminAccess } from "@/lib/adminAuth";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  UtensilsCrossed,
  ShoppingBag,
  Users,
  LogOut,
  Menu,
  X,
  ChefHat,
  CreditCard,
  UserCheck,
  Bell,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const superAdminNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Meals", href: "/meals", icon: UtensilsCrossed },
  { name: "Orders", href: "/orders", icon: ShoppingBag },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Users", href: "/users", icon: Users },
  { name: "Referrals", href: "/referrals", icon: UserCheck },
  { name: "Partners", href: "/partners", icon: Users },
];

const partnerNavigation = [
  { name: "Dashboard", href: "/partner-dashboard", icon: LayoutDashboard },
  { name: "My Referrals", href: "/partner-referrals", icon: UserCheck },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    setUserEmail(session.user.email || "");

    const adminAccess = await getAdminAccess(session.user.id);

    if (adminAccess.hasAccess) {
      setUserRole(adminAccess.role);
      return;
    }

    // Check if partner
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("contact_email", session.user.email)
      .eq("status", "active")
      .single();

    if (partnerData) {
      setUserRole("partner");
    }
  };

  const navigation = userRole === "partner" ? partnerNavigation : superAdminNavigation;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const sidebarWidth = "w-[260px]";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Desktop hover trigger zone - very thin invisible strip on the left edge */}
      <div 
        className="fixed top-0 left-0 w-6 h-full z-40 hidden lg:block"
        onMouseEnter={() => setIsHovering(true)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-sidebar transition-all duration-300 shadow-2xl shadow-black/20",
          sidebarWidth,
          (sidebarOpen || isHovering) ? "translate-x-0" : "-translate-x-full"
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between px-5 border-b border-sidebar-border/50">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-secondary to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 flex-shrink-0">
                <ChefHat className="w-5 h-5 text-white" />
              </div>
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-lg font-heading font-bold text-sidebar-foreground tracking-tight"
              >
                OZ Kitchen
              </motion.span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 py-4 px-3 custom-scrollbar overflow-y-auto">
            <p className="px-3 mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
              Navigation
            </p>
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn("nav-link", isActive && "active")}
                >
                  <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0", isActive ? "text-white" : "text-sidebar-foreground/60")} />
                  <span>{item.name}</span>
                  {isActive && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-secondary to-orange-500 -z-10"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User & Logout */}
          <div className="border-t border-sidebar-border/50 p-3">
            {userEmail && (
              <div className="mb-3 px-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sidebar-accent flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-semibold text-sidebar-foreground">
                      {userEmail.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-sidebar-foreground truncate">{userEmail}</p>
                    <p className="text-[10px] text-sidebar-foreground/50 capitalize">{userRole || "User"}</p>
                  </div>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground/60 hover:text-rose-400 hover:bg-rose-500/10 w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="transition-all duration-300 w-full flex-1 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border/50 bg-background/80 backdrop-blur-xl px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden -ml-2 text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Desktop visual hint for the sidebar */}
          <div className="hidden lg:flex items-center text-sm text-muted-foreground/50 italic ml-2">
            Move mouse to the left edge to open menu
          </div>

          <div className="flex-1" />

          {/* Notification bell placeholder */}
          <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-secondary rounded-full" />
          </Button>
        </header>

        {/* Page content */}
        <main className="p-6 lg:p-8 animate-fade-in flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};
