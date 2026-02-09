import {
  Bell,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  User,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EditProfileDialog } from "./EditProfileDialog";
import { formatDistanceToNow } from "date-fns";
import { id as localeId, enUS } from "date-fns/locale";
import logoImage from "@/assets/logo-kemika.png";

interface NotificationLog {
  id: string;
  event_type: string;
  subject: string;
  status: string;
  created_at: string;
  request_id: string | null;
}

interface PendingItem {
  id: string;
  type: 'request' | 'medical' | 'cash_advance';
  number: string;
  description: string;
  amount: number;
  created_at: string;
  status: string;
}

interface AppHeaderProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const AppHeader = ({ isCollapsed, onToggle }: AppHeaderProps) => {
  const navigate = useNavigate();
  const { profile, role, signOut, user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { toast } = useToast();
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains("dark");
  });
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(() => {
    return localStorage.getItem("notification_last_seen");
  });
  const [showEditProfile, setShowEditProfile] = useState(false);

  // Fetch pending items that need attention (approvals)
  const { data: pendingItems = [], refetch: refetchPendingItems } = useQuery({
    queryKey: ["header-pending-items", user?.id, role],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const items: PendingItem[] = [];

      // Fetch pending requests
      const { data: requests } = await supabase
        .from("requests")
        .select("id, request_number, description, amount, created_at, status")
        .in("status", ["submitted", "under_review"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (requests) {
        items.push(...requests.map(r => ({
          id: r.id,
          type: 'request' as const,
          number: r.request_number,
          description: r.description,
          amount: r.amount,
          created_at: r.created_at,
          status: r.status,
        })));
      }

      // Fetch pending medical claims
      const { data: medicalClaims } = await supabase
        .from("medical_claims")
        .select("id, claim_number, patient_name, claim_amount, created_at, status")
        .in("status", ["submitted", "review_hrga"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (medicalClaims) {
        items.push(...medicalClaims.map(m => ({
          id: m.id,
          type: 'medical' as const,
          number: m.claim_number,
          description: m.patient_name,
          amount: m.claim_amount,
          created_at: m.created_at,
          status: m.status,
        })));
      }

      // Fetch pending cash advances
      const { data: cashAdvances } = await supabase
        .from("cash_advances")
        .select("id, ca_number, purpose, total_amount, created_at, status")
        .in("status", ["submitted", "under_review"])
        .order("created_at", { ascending: false })
        .limit(5);

      if (cashAdvances) {
        items.push(...cashAdvances.map(c => ({
          id: c.id,
          type: 'cash_advance' as const,
          number: c.ca_number,
          description: c.purpose,
          amount: c.total_amount,
          created_at: c.created_at,
          status: c.status,
        })));
      }

      // Sort all items by created_at
      return items.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 10);
    },
    enabled: !!user?.id && (role === "super_admin" || role === "admin"),
    refetchInterval: 30000,
  });

  // Subscribe to real-time updates for pending items
  useEffect(() => {
    if (!user?.id || (role !== "super_admin" && role !== "admin")) return;

    const channel = supabase
      .channel("pending-items-realtime")
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => {
        refetchPendingItems();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_claims' }, () => {
        refetchPendingItems();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_advances' }, () => {
        refetchPendingItems();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role, refetchPendingItems]);

  // Calculate unread count (items not yet seen)
  const unreadCount = pendingItems.filter((item) => {
    if (!lastSeenAt) return true;
    return new Date(item.created_at) > new Date(lastSeenAt);
  }).length;

  useEffect(() => {
    // Sync dark mode state with document
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleNotificationOpen = (open: boolean) => {
    setNotificationOpen(open);
    if (open && pendingItems.length > 0) {
      const latestTime = pendingItems[0].created_at;
      setLastSeenAt(latestTime);
      localStorage.setItem("notification_last_seen", latestTime);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({
      title: t("user.logoutSuccess"),
      description: t("user.logoutMessage"),
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
    if (!role) return t("role.user");
    const roleKey = `role.${role === "super_admin" ? "superAdmin" : role}`;
    return t(roleKey);
  };

  const formatTimeAgo = (dateStr: string) => {
    return formatDistanceToNow(new Date(dateStr), {
      addSuffix: true,
      locale: language === "id" ? localeId : enUS,
    });
  };

  const displayName = profile?.full_name || "User";
  const displayRole = getRoleLabel(role);
  const initials = getInitials(displayName);
  const avatarUrl = profile?.avatar_url;

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-40 flex-shrink-0">
      {/* Left Section: Logo & Company Name */}
      <div className="flex items-center gap-3">
        {/* Toggle Sidebar Button - Desktop */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggle} 
          className="hidden md:flex text-muted-foreground hover:text-foreground"
        >
          {isCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        {/* Hamburger Menu - Mobile */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onToggle} 
          className="md:hidden text-muted-foreground hover:text-foreground"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>

        {/* Logo - Fixed size with contain for full visibility */}
        <div className="w-14 h-12 flex-shrink-0 flex items-center justify-center">
          <img
            src={logoImage}
            alt="Kemika"
            className="max-w-full max-h-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

        {/* Company Name */}
        <div className="hidden sm:block">
          <h1 className="text-base font-bold text-foreground tracking-wide">PT. KEMIKA KARYA PRATAMA</h1>
          <p className="text-xs text-muted-foreground">Enterprise Expense & Budget System</p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <div className="flex items-center bg-secondary rounded-lg p-1">
          <button
            onClick={() => setLanguage("en")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "en" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage("id")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "id" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ID
          </button>
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-muted-foreground hover:text-foreground"
        >
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        {/* Notifications */}
        <Popover open={notificationOpen} onOpenChange={handleNotificationOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 bg-popover border border-border shadow-lg">
            <div className="p-4 border-b border-border bg-popover">
              <h3 className="font-semibold text-foreground">{t("header.pendingApprovals")}</h3>
            </div>
            <div className="max-h-80 overflow-y-auto bg-popover">
              {pendingItems.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">{t("header.noNotifications")}</p>
                </div>
              ) : (
                pendingItems.map((item) => {
                  const isUnread = !lastSeenAt || new Date(item.created_at) > new Date(lastSeenAt);
                  const typeLabel = item.type === 'medical' 
                    ? (language === 'id' ? 'Klaim Medis' : 'Medical Claim')
                    : item.type === 'cash_advance'
                    ? (language === 'id' ? 'Kasbon' : 'Cash Advance')
                    : (language === 'id' ? 'Pengajuan' : 'Request');
                  const routePath = item.type === 'medical' 
                    ? '/medical-reimbursement'
                    : item.type === 'cash_advance'
                    ? '/cash-advance'
                    : '/approvals';
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      onClick={() => navigate(routePath)}
                      className={`p-4 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer ${
                        isUnread ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {isUnread && <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />}
                        <div className={`flex-1 ${isUnread ? "" : "ml-5"}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {typeLabel}
                            </Badge>
                            <span className="text-xs font-mono text-muted-foreground">{item.number}</span>
                          </div>
                          <p className="text-sm text-foreground mt-1 line-clamp-1">{item.description}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-muted-foreground">
                              {formatTimeAgo(item.created_at)}
                            </p>
                            <p className="text-xs font-medium text-primary">
                              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(item.amount)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-3 border-t border-border bg-popover">
              <Button variant="ghost" className="w-full text-sm" onClick={() => navigate("/approvals")}>
                {t("header.viewAllNotifications")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 ml-2 pl-2 border-l border-border">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                  {displayRole}
                </Badge>
              </div>
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-primary/20"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    e.currentTarget.nextElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <div
                className={`w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center ${avatarUrl ? "hidden" : ""}`}
              >
                <span className="text-sm font-semibold text-primary">{initials}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setShowEditProfile(true)} className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              {t("user.myProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              {t("user.settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              {t("user.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Edit Profile Dialog */}
      <EditProfileDialog open={showEditProfile} onOpenChange={setShowEditProfile} />
    </header>
  );
};

export default AppHeader;
