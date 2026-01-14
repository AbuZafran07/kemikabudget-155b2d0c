import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
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
  Mail,
  ChevronDown,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import appIcon from "@/assets/app-icon.png";

interface MenuItem {
  titleKey: string;
  icon: React.ElementType;
  href?: string;
  badgeKey?: string; // Changed from static badge to dynamic key
  children?: MenuItem[];
  roles?: AppRole[];
}

interface MenuSection {
  titleKey: string;
  items: MenuItem[];
  roles?: AppRole[];
}

const getMenuSections = (): MenuSection[] => [
  {
    titleKey: "nav.summary",
    items: [
      { titleKey: "nav.dashboard", icon: LayoutDashboard, href: "/dashboard" },
    ],
  },
  {
    titleKey: "nav.transactions",
    items: [
      { titleKey: "nav.requests", icon: FileText, href: "/requests" },
      { titleKey: "nav.approvals", icon: CheckSquare, href: "/approvals", badgeKey: "pendingApprovals", roles: ["super_admin"] },
    ],
  },
  {
    titleKey: "nav.finance",
    items: [
      { titleKey: "nav.paymentQueue", icon: CreditCard, href: "/payment-queue", badgeKey: "pendingPayments", roles: ["super_admin", "finance"] },
      { titleKey: "nav.pettyCash", icon: Wallet, href: "/petty-cash", roles: ["super_admin", "finance"] },
      { titleKey: "nav.bankPayments", icon: Building2, href: "/bank-payments", roles: ["super_admin", "finance"] },
    ],
    roles: ["super_admin", "finance"],
  },
  {
    titleKey: "nav.planning",
    items: [
      { titleKey: "nav.budgetPlanning", icon: Calculator, href: "/budget-planning", roles: ["super_admin"] },
      { titleKey: "nav.budgetTransfer", icon: ArrowRightLeft, href: "/budget-transfer" },
    ],
  },
  {
    titleKey: "nav.masterData",
    items: [
      { titleKey: "nav.divisions", icon: Building2, href: "/divisions", roles: ["super_admin"] },
      { titleKey: "nav.categories", icon: Tags, href: "/categories", roles: ["super_admin"] },
      { titleKey: "nav.fundingSources", icon: Landmark, href: "/funding-sources", roles: ["super_admin"] },
      { titleKey: "nav.users", icon: Users, href: "/users", roles: ["super_admin"] },
      { titleKey: "nav.sessionManagement", icon: Shield, href: "/session-management", roles: ["super_admin"] },
      { titleKey: "nav.settings", icon: Settings, href: "/settings", roles: ["super_admin"] },
    ],
    roles: ["super_admin"],
  },
  {
    titleKey: "nav.reports",
    items: [
      { titleKey: "nav.report", icon: BarChart3, href: "/reports", roles: ["super_admin", "finance"] },
      { titleKey: "nav.auditLogs", icon: FileSearch, href: "/audit-logs", roles: ["super_admin"] },
      { titleKey: "nav.notifications", icon: Mail, href: "/notification-history", roles: ["super_admin", "finance"] },
    ],
    roles: ["super_admin", "finance"],
  },
];

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut, user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  // Fetch real pending counts from database
  const { data: badgeCounts = { pendingApprovals: 0, pendingPayments: 0 } } = useQuery({
    queryKey: ['sidebar-badge-counts', user?.id],
    queryFn: async () => {
      // Count pending approvals (submitted or under_review)
      const { count: pendingApprovals } = await supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']);

      // Count pending payments (approved but not paid)
      const { count: pendingPayments } = await supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      return {
        pendingApprovals: pendingApprovals || 0,
        pendingPayments: pendingPayments || 0,
      };
    },
    enabled: !!user?.id && (role === 'super_admin' || role === 'finance'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Subscribe to real-time updates for badge counts
  useEffect(() => {
    if (!user?.id || (role !== 'super_admin' && role !== 'finance')) return;

    const channel = supabase
      .channel('sidebar-badge-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'requests'
        },
        () => {
          // Refetch badge counts when requests change
          // The query will automatically refetch via queryKey invalidation
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role]);

  const menuSections = getMenuSections();

  const toggleMenu = (titleKey: string) => {
    setExpandedMenus((prev) =>
      prev.includes(titleKey)
        ? prev.filter((tk) => tk !== titleKey)
        : [...prev, titleKey]
    );
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  const canAccessItem = (item: MenuItem | MenuSection): boolean => {
    if (!item.roles || item.roles.length === 0) return true;
    if (!role) return false;
    return item.roles.includes(role);
  };

  const getBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    return badgeCounts[badgeKey as keyof typeof badgeCounts] || 0;
  };

  const handleLogout = async () => {
    await signOut();
    toast({
      title: t('user.logoutSuccess'),
      description: t('user.logoutMessage'),
    });
    navigate("/");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string | null) => {
    if (!role) return t('role.user');
    const roleKey = `role.${role === 'super_admin' ? 'superAdmin' : role}`;
    return t(roleKey);
  };

  const displayName = profile?.full_name || "User";
  const displayRole = getRoleLabel(role);
  const initials = getInitials(displayName);

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    if (!canAccessItem(item)) return null;

    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.includes(item.titleKey);
    const active = isActive(item.href);
    const title = t(item.titleKey);
    const badgeCount = getBadgeCount(item.badgeKey);

    if (hasChildren) {
      const visibleChildren = item.children?.filter(canAccessItem) || [];
      if (visibleChildren.length === 0) return null;

      return (
        <div key={item.titleKey}>
          <button
            onClick={() => toggleMenu(item.titleKey)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isCollapsed && "justify-center px-2"
            )}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">{title}</span>
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
              {visibleChildren.map((child) => renderMenuItem(child, depth + 1))}
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
            <span className="flex-1">{title}</span>
            {badgeCount > 0 && (
              <Badge
                variant="secondary"
                className="bg-accent text-accent-foreground text-xs px-2 py-0.5 min-w-[1.5rem] justify-center"
              >
                {badgeCount}
              </Badge>
            )}
          </>
        )}
      </NavLink>
    );

    if (isCollapsed) {
      return (
        <Tooltip key={item.titleKey} delayDuration={0}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {title}
            {badgeCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {badgeCount}
              </Badge>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={item.titleKey}>{linkContent}</div>;
  };

  const renderSection = (section: MenuSection) => {
    if (!canAccessItem(section)) return null;

    const visibleItems = section.items.filter(canAccessItem);
    if (visibleItems.length === 0) return null;

    return (
      <div key={section.titleKey}>
        {!isCollapsed && (
          <h3 className="px-3 mb-2 text-xs font-semibold text-sidebar-muted uppercase tracking-wider">
            {t(section.titleKey)}
          </h3>
        )}
        <div className="space-y-1">
          {visibleItems.map((item) => renderMenuItem(item))}
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "h-screen flex flex-col gradient-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0 sticky top-0",
        isCollapsed ? "w-[70px]" : "w-[260px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className={cn("flex items-center gap-3", isCollapsed && "justify-center w-full")}>
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-background/10">
            <img 
              src={appIcon} 
              alt="Kemika" 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
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
        {menuSections.map(renderSection)}
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
            <TooltipContent side="right">{t('common.expandSidebar')}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center">
              <span className="text-sm font-semibold text-sidebar-accent-foreground">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {displayName}
              </p>
              <p className="text-xs text-sidebar-muted truncate">{displayRole}</p>
            </div>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('action.logout')}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
