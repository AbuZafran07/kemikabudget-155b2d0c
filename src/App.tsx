import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import Approvals from "./pages/Approvals";
import PaymentQueue from "./pages/PaymentQueue";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/layout/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/payment-queue" element={<PaymentQueue />} />
            <Route path="/petty-cash" element={<Dashboard />} />
            <Route path="/bank-payments" element={<Dashboard />} />
            <Route path="/budget-planning" element={<Dashboard />} />
            <Route path="/budget-transfer" element={<Dashboard />} />
            <Route path="/divisions" element={<Dashboard />} />
            <Route path="/categories" element={<Dashboard />} />
            <Route path="/funding-sources" element={<Dashboard />} />
            <Route path="/users" element={<Dashboard />} />
            <Route path="/settings" element={<Dashboard />} />
            <Route path="/reports" element={<Dashboard />} />
            <Route path="/audit-logs" element={<Dashboard />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
