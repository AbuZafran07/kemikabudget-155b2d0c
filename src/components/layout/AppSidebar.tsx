import { useState, useEffect } from "react";
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
  Diff,
  CalendarDays,
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
  PanelLeft,
  Shield,
  FileType,
  Heart,
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      { 
        titleKey: "nav.expenseRequest", 
        icon: FileText, 
        children: [
          { titleKey: "nav.requests", icon: FileText, href: "/requests" },
          { titleKey: "nav.cashAdvance", icon: Wallet, href: "/cash-advance" },
        ]
      },
      { titleKey: "nav.medicalReimbursement", icon: Heart, href: "/medical-reimbursement" },
      { titleKey: "nav.approvals", icon: CheckSquare, href: "/approvals", badgeKey: "pendingApprovals", roles: ["super_admin", "admin"] },
    ],
  },
  {
    titleKey: "nav.finance",
    items: [
      { titleKey: "nav.paymentQueue", icon: CreditCard, href: "/payment-queue", badgeKey: "pendingPayments", roles: ["super_admin", "finance", "admin"] },
      { titleKey: "nav.pettyCash", icon: Wallet, href: "/petty-cash", roles: ["super_admin", "finance", "admin"] },
      { titleKey: "nav.bankPayments", icon: Building2, href: "/bank-payments", roles: ["super_admin", "finance", "admin"] },
      { titleKey: "nav.adjustments", icon: Diff, href: "/adjustments", roles: ["super_admin", "finance"] },
    ],
    roles: ["super_admin", "finance", "admin"],
  },
  {
    titleKey: "nav.planning",
    items: [
      { titleKey: "nav.budgetPlanning", icon: Calculator, href: "/budget-planning" },
      { titleKey: "nav.budgetPeriods", icon: CalendarDays, href: "/budget-periods", roles: ["super_admin", "admin"] },
      { titleKey: "nav.budgetTransfer", icon: ArrowRightLeft, href: "/budget-transfer" },
    ],
  },
  {
    titleKey: "nav.masterData",
    items: [
      { titleKey: "nav.divisions", icon: Building2, href: "/divisions", roles: ["super_admin", "admin"] },
      { titleKey: "nav.categories", icon: Tags, href: "/categories" },
      { titleKey: "nav.fundingSources", icon: Landmark, href: "/funding-sources", roles: ["super_admin", "admin"] },
      { titleKey: "nav.employeeMedicalBudgets", icon: Heart, href: "/employee-medical-budgets", roles: ["super_admin"] },
      { titleKey: "nav.users", icon: Users, href: "/users", roles: ["super_admin", "admin"] },
      { titleKey: "nav.sessionManagement", icon: Shield, href: "/session-management", roles: ["super_admin", "admin"] },
      { titleKey: "nav.documentTemplates", icon: FileType, href: "/document-templates", roles: ["super_admin", "admin"] },
      { titleKey: "nav.settings", icon: Settings, href: "/settings", roles: ["super_admin", "admin"] },
    ],
  },
  {
    titleKey: "nav.reports",
    items: [
      { titleKey: "nav.report", icon: BarChart3, href: "/reports", roles: ["super_admin", "finance", "admin", "user"] },
      { titleKey: "nav.auditLogs", icon: FileSearch, href: "/audit-logs", roles: ["super_admin", "admin"] },
      { titleKey: "nav.notifications", icon: Mail, href: "/notification-history", roles: ["super_admin", "finance", "admin"] },
    ],
  },
];

interface AppSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const AppSidebar = ({ isCollapsed, onToggle }: AppSidebarProps) => {
  const location = useLocation();
  const { role, user } = useAuth();
  const { t } = useLanguage();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  // Fetch real pending counts from database (including requests, medical_claims, cash_advances)
  const { data: badgeCounts = { pendingApprovals: 0, pendingPayments: 0 }, refetch: refetchBadges } = useQuery({
    queryKey: ['sidebar-badge-counts', user?.id, role],
    queryFn: async () => {
      // Count pending approvals from requests (submitted or under_review)
      const { count: pendingRequestApprovals } = await supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']);

      // Count pending approvals from medical claims (submitted or review_hrga)
      const { count: pendingMedicalApprovals } = await supabase
        .from('medical_claims')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'review_hrga']);

      // Count pending approvals from cash advances (submitted or under_review)
      const { count: pendingCashAdvanceApprovals } = await supabase
        .from('cash_advances')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']);

      // Total pending approvals
      const pendingApprovals = 
        (pendingRequestApprovals || 0) + 
        (pendingMedicalApprovals || 0) + 
        (pendingCashAdvanceApprovals || 0);

      // Count pending payments from requests (approved but not paid)
      const { count: pendingRequestPayments } = await supabase
        .from('requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      // Count pending payments from medical claims (approved but not paid)
      const { count: pendingMedicalPayments } = await supabase
        .from('medical_claims')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      // Count pending payments from cash advances (approved but not paid)
      const { count: pendingCashAdvancePayments } = await supabase
        .from('cash_advances')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved');

      // Total pending payments
      const pendingPayments = 
        (pendingRequestPayments || 0) + 
        (pendingMedicalPayments || 0) + 
        (pendingCashAdvancePayments || 0);

      return {
        pendingApprovals,
        pendingPayments,
      };
    },
    enabled: !!user?.id && (role === 'super_admin' || role === 'finance' || role === 'admin'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Subscribe to real-time updates for badge counts
  useEffect(() => {
    if (!user?.id || (role !== 'super_admin' && role !== 'finance' && role !== 'admin')) return;

    const channel = supabase
      .channel('sidebar-badge-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        refetchBadges();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_claims' }, () => {
        refetchBadges();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_advances' }, () => {
        refetchBadges();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role, refetchBadges]);

  // Auto-close sidebar on mobile when route changes
  useEffect(() => {
    if (window.innerWidth < 768 && !isCollapsed) {
      onToggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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
                className="bg-accent text-accent-foreground text-xs px-2 py-0.5 min-w-[1.5rem] justify-center animate-pulse"
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
              <Badge variant="secondary" className="text-xs animate-pulse">
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
    <>
      {/* Mobile Overlay */}
      {!isCollapsed && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={onToggle}
        />
      )}
      
      <aside
        className={cn(
          "h-full flex flex-col gradient-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0",
          // Mobile: Fixed overlay sidebar
          "fixed md:relative z-50 md:z-auto",
          // Mobile: Hide by default, show when not collapsed
          isCollapsed 
            ? "-translate-x-full md:translate-x-0 md:w-[70px]" 
            : "translate-x-0 w-[260px]"
        )}
      >

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {menuSections.map(renderSection)}
        </nav>

        {/* Footer Section */}
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
            <div className="text-center">
              <p className="text-xs text-sidebar-muted">
                © 2026 PT. Kemika Karya Pratama
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default AppSidebar;
