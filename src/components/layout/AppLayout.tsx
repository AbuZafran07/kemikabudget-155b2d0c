import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import { useIsMobile } from "@/hooks/use-mobile";

const AppLayout = () => {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    // Default to collapsed on mobile
    return typeof window !== 'undefined' && window.innerWidth < 768;
  });

  // Auto-collapse on mobile when navigating
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile]);

  const handleToggle = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Full-width Header at top */}
      <AppHeader 
        isCollapsed={sidebarCollapsed}
        onToggle={handleToggle}
      />
      {/* Content Area with sidebar and main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <AppSidebar
          isCollapsed={sidebarCollapsed}
          onToggle={handleToggle}
        />
        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
