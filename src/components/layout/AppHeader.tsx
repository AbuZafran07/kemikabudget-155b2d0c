import { Bell, Search, Moon, Sun, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

const notifications = [
  {
    id: 1,
    titleId: "Pengajuan baru",
    titleEn: "New request",
    descId: "Transport meeting client dari HRGA",
    descEn: "Transport meeting client from HRGA",
    time: "5",
  },
  {
    id: 2,
    titleId: "Menunggu persetujuan",
    titleEn: "Pending approval",
    descId: "3 pengajuan menunggu approval Anda",
    descEn: "3 requests waiting for your approval",
    time: "60",
  },
  {
    id: 3,
    titleId: "Pembayaran selesai",
    titleEn: "Payment completed",
    descId: "Invoice vendor ABC telah dibayar",
    descEn: "Invoice for vendor ABC has been paid",
    time: "120",
  },
];

const AppHeader = () => {
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { toast } = useToast();
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const unreadCount = 2;

  useEffect(() => {
    // Sync dark mode state with document
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
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

  const getTimeLabel = (minutes: string) => {
    const min = parseInt(minutes);
    if (min < 60) {
      return language === 'id' ? `${min} menit lalu` : `${min} minutes ago`;
    }
    const hours = Math.floor(min / 60);
    return language === 'id' ? `${hours} jam lalu` : `${hours} hours ago`;
  };

  const displayName = profile?.full_name || "User";
  const displayRole = getRoleLabel(role);
  const initials = getInitials(displayName);

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t('header.search')}
            className="pl-9 bg-background border-border"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <div className="flex items-center bg-secondary rounded-lg p-1">
          <button
            onClick={() => setLanguage("en")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "en"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage("id")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "id"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
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
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-muted-foreground hover:text-foreground"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-destructive text-destructive-foreground text-xs font-medium rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">{t('header.notifications')}</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notification, index) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer ${
                    index < 2 ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {index < 2 && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    )}
                    <div className={index < 2 ? "" : "ml-5"}>
                      <p className="text-sm font-medium text-foreground">
                        {language === 'id' ? notification.titleId : notification.titleEn}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {language === 'id' ? notification.descId : notification.descEn}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {getTimeLabel(notification.time)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border">
              <Button 
                variant="ghost" 
                className="w-full text-sm"
                onClick={() => navigate("/notification-history")}
              >
                {t('header.viewAllNotifications')}
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
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">{initials}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              {t('user.myProfile')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              {t('user.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              {t('user.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default AppHeader;
