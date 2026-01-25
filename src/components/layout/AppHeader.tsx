import {
  Bell,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  User,
  Settings,
  FileText,
  CheckCircle,
  XCircle,
  CreditCard,
  Mail,
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
import { useEffect, useState, useCallback } from "react";
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

  // Helper function moved up to be used in useEffect
  const getEventLabel = useCallback(
    (eventType: string) => {
      const labels: Record<string, { id: string; en: string }> = {
        submitted: { id: "Pengajuan Baru", en: "New Submission" },
        approved: { id: "Pengajuan Disetujui", en: "Request Approved" },
        rejected: { id: "Pengajuan Ditolak", en: "Request Rejected" },
        paid: { id: "Pembayaran Selesai", en: "Payment Completed" },
        settled: { id: "Transaksi Diselesaikan", en: "Transaction Settled" },
      };
      return labels[eventType]?.[language] || eventType;
    },
    [language],
  );

  // Fetch real notifications from database
  const { data: notifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ["header-notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("notification_logs")
        .select("id, event_type, subject, status, created_at, request_id")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        if (import.meta.env.DEV) {
          console.error("Error fetching notifications:", error);
        }
        return [];
      }

      return data as NotificationLog[];
    },
    enabled: !!user?.id && (role === "super_admin" || role === "finance"),
  });

  // Subscribe to real-time notification updates
  useEffect(() => {
    if (!user?.id || (role !== "super_admin" && role !== "finance")) return;

    const channel = supabase
      .channel("notification-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_logs",
        },
        (payload) => {
          if (import.meta.env.DEV) {
            console.log("New notification received:", payload);
          }
          // Refetch notifications when a new one is inserted
          refetchNotifications();

          // Show toast for new notification
          const newNotification = payload.new as NotificationLog;
          toast({
            title: getEventLabel(newNotification.event_type),
            description: newNotification.subject,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role, refetchNotifications, toast, getEventLabel]);

  // Calculate unread count
  const unreadCount = notifications.filter((n) => {
    if (!lastSeenAt) return true;
    return new Date(n.created_at) > new Date(lastSeenAt);
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
    if (open && notifications.length > 0) {
      const latestTime = notifications[0].created_at;
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

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "submitted":
        return <FileText className="h-4 w-4 text-blue-500" />;
      case "approved":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "paid":
        return <CreditCard className="h-4 w-4 text-primary" />;
      case "settled":
        return <CheckCircle className="h-4 w-4 text-success" />;
      default:
        return <Mail className="h-4 w-4 text-muted-foreground" />;
    }
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
        {/* Toggle Sidebar Button */}
        <Button variant="ghost" size="icon" onClick={onToggle} className="text-muted-foreground hover:text-foreground">
          {isCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>

        {/* Logo */}
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-primary/10">
          <img
            src={appIcon}
            alt="Kemika"
            className="w-full h-full object-cover"
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
              <h3 className="font-semibold text-foreground">{t("header.notifications")}</h3>
            </div>
            <div className="max-h-80 overflow-y-auto bg-popover">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-muted-foreground">{t("header.noNotifications")}</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const isUnread = !lastSeenAt || new Date(notification.created_at) > new Date(lastSeenAt);
                  return (
                    <div
                      key={notification.id}
                      onClick={() => navigate("/notification-history")}
                      className={`p-4 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer ${
                        isUnread ? "bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {isUnread && <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />}
                        <div className={`flex items-start gap-2 ${isUnread ? "" : "ml-5"}`}>
                          {getEventIcon(notification.event_type)}
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {getEventLabel(notification.event_type)}
                            </p>
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{notification.subject}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatTimeAgo(notification.created_at)}
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
              <Button variant="ghost" className="w-full text-sm" onClick={() => navigate("/notification-history")}>
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
