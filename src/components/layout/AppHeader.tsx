import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell, Search, Moon, Sun, Globe, ChevronDown } from "lucide-react";
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

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/requests": "Pengajuan",
  "/approvals": "Persetujuan",
  "/payment-queue": "Antrian Pembayaran",
  "/petty-cash": "Kas Kecil",
  "/bank-payments": "Pembayaran Bank",
  "/budget-planning": "Rencana Anggaran",
  "/budget-transfer": "Transfer Anggaran",
  "/divisions": "Divisi",
  "/categories": "Kategori Biaya",
  "/funding-sources": "Sumber Dana",
  "/users": "Pengguna",
  "/settings": "Pengaturan",
  "/reports": "Laporan",
  "/audit-logs": "Audit Log",
};

const notifications = [
  {
    id: 1,
    title: "Pengajuan baru",
    description: "Transport meeting client dari HRGA",
    time: "5 menit lalu",
    unread: true,
  },
  {
    id: 2,
    title: "Menunggu persetujuan",
    description: "3 pengajuan menunggu approval Anda",
    time: "1 jam lalu",
    unread: true,
  },
  {
    id: 3,
    title: "Pembayaran selesai",
    description: "Invoice vendor ABC telah dibayar",
    time: "2 jam lalu",
    unread: false,
  },
];

const AppHeader = () => {
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);
  const [language, setLanguage] = useState<"ID" | "EN">("ID");

  const pageTitle = routeTitles[location.pathname] || "Dashboard";
  const unreadCount = notifications.filter((n) => n.unread).length;

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <header className="h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Cari transaksi, request..."
            className="pl-9 bg-background border-border"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <div className="flex items-center bg-secondary rounded-lg p-1">
          <button
            onClick={() => setLanguage("EN")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "EN"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage("ID")}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              language === "ID"
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
              <h3 className="font-semibold text-foreground">Notifikasi</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer ${
                    notification.unread ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {notification.unread && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                    )}
                    <div className={notification.unread ? "" : "ml-5"}>
                      <p className="text-sm font-medium text-foreground">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {notification.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {notification.time}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border">
              <Button variant="ghost" className="w-full text-sm">
                Lihat semua notifikasi
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 ml-2 pl-2 border-l border-border">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">Ferry Ferdiansyah</p>
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                  super admin
                </Badge>
              </div>
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">FF</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>Profil Saya</DropdownMenuItem>
            <DropdownMenuItem>Pengaturan</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Keluar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default AppHeader;
