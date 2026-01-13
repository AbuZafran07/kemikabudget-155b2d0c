import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  CreditCard,
  Wallet,
  Building2,
  Calculator,
  ArrowRightLeft,
  Users,
  Tags,
  Landmark,
  Settings,
  BarChart3,
  FileSearch,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import appIcon from "@/assets/app-icon.png";

interface MenuItem {
  title: string;
  icon: React.ElementType;
  href?: string;
  badge?: number;
  children?: MenuItem[];
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const menuSections: MenuSection[] = [
  {
    title: "RINGKASAN",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ],
  },
  {
    title: "TRANSAKSI",
    items: [
      { title: "Pengajuan", icon: FileText, href: "/requests" },
      { title: "Persetujuan", icon: CheckSquare, href: "/approvals", badge: 5 },
    ],
  },
  {
    title: "KEUANGAN",
    items: [
      { title: "Antrian Pembayaran", icon: CreditCard, href: "/payment-queue", badge: 3 },
      { title: "Kas Kecil", icon: Wallet, href: "/petty-cash" },
      { title: "Pembayaran Bank", icon: Building2, href: "/bank-payments" },
    ],
  },
  {
    title: "PERENCANAAN",
    items: [
      { title: "Rencana Anggaran", icon: Calculator, href: "/budget-planning" },
      { title: "Transfer Anggaran", icon: ArrowRightLeft, href: "/budget-transfer" },
    ],
  },
  {
    title: "MASTER DATA",
    items: [
      { title: "Divisi", icon: Building2, href: "/divisions" },
      { title: "Kategori Biaya", icon: Tags, href: "/categories" },
      { title: "Sumber Dana", icon: Landmark, href: "/funding-sources" },
      { title: "Pengguna", icon: Users, href: "/users" },
      { title: "Pengaturan", icon: Settings, href: "/settings" },
    ],
  },
  {
    title: "LAPORAN",
    items: [
      { title: "Laporan", icon: BarChart3, href: "/reports" },
      { title: "Audit Log", icon: FileSearch, href: "/audit-logs" },
    ],
  },
];

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  const toggleMenu = (title: string) => {
    setExpandedMenus((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    );
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.title);
    const active = isActive(item.href);

    if (hasChildren) {
      return (
        <div key={item.title}>
          <button
            onClick={() => toggleMenu(item.title)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isCollapsed && "justify-center px-2"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">{item.title}</span>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </>
            )}
          </button>
          {!isCollapsed && isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
              {item.children.map((child) => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const linkContent = (
      <NavLink
        to={item.href || "#"}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
          isCollapsed && "justify-center px-2"
        )}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.title}</span>
            {item.badge && item.badge > 0 && (
              <Badge
                variant="secondary"
                className="bg-accent text-accent-foreground text-xs px-2 py-0.5 min-w-[1.5rem] justify-center"
              >
                {item.badge}
              </Badge>
            )}
          </>
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.title} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.title}
            {item.badge && item.badge > 0 && (
              <Badge variant="secondary" className="text-xs">
                {item.badge}
              </Badge>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.title}>{linkContent}</div>;
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col gradient-sidebar border-r border-sidebar-border transition-all duration-300",
        isCollapsed ? "w-[70px]" : "w-[260px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className={cn("flex items-center gap-3", isCollapsed && "justify-center w-full")}>
          <img src={appIcon} alt="Kemika" className="w-10 h-10 rounded-lg" />
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-sidebar-foreground tracking-wide">
                KEMIKA
              </h1>
              <p className="text-xs text-sidebar-muted">Expense System</p>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <PanelLeftClose className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {menuSections.map((section) => (
          <div key={section.title}>
            {!isCollapsed && (
              <h3 className="px-3 mb-2 text-xs font-semibold text-sidebar-muted uppercase tracking-wider">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => renderMenuItem(item))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-sidebar-border">
        {isCollapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="w-full text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand Sidebar</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sm font-semibold text-sidebar-accent-foreground">FF</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                Ferry Ferdiansyah
              </p>
              <p className="text-xs text-sidebar-muted truncate">Super Admin</p>
            </div>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Keluar</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
