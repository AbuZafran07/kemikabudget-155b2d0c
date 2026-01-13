import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import Approvals from "./pages/Approvals";
import PaymentQueue from "./pages/PaymentQueue";
import PettyCash from "./pages/PettyCash";
import BudgetPlanning from "./pages/BudgetPlanning";
import BudgetTransfer from "./pages/BudgetTransfer";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/layout/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/requests" element={<Requests />} />
              <Route
                path="/approvals"
                element={
                  <ProtectedRoute requiredRole="super_admin">
                    <Approvals />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payment-queue"
                element={
                  <ProtectedRoute requiredRole="finance">
                    <PaymentQueue />
                  </ProtectedRoute>
                }
              />
              <Route path="/petty-cash" element={
                <ProtectedRoute requiredRole="finance">
                  <PettyCash />
                </ProtectedRoute>
              } />
              <Route path="/bank-payments" element={<Dashboard />} />
              <Route path="/budget-planning" element={
                <ProtectedRoute requiredRole="super_admin">
                  <BudgetPlanning />
                </ProtectedRoute>
              } />
              <Route path="/budget-transfer" element={
                <ProtectedRoute requiredRole="admin">
                  <BudgetTransfer />
                </ProtectedRoute>
              } />
              <Route path="/divisions" element={<Dashboard />} />
              <Route path="/categories" element={<Dashboard />} />
              <Route path="/funding-sources" element={<Dashboard />} />
              <Route path="/users" element={
                <ProtectedRoute requiredRole="super_admin">
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={<Dashboard />} />
              <Route path="/reports" element={<Dashboard />} />
              <Route path="/audit-logs" element={<Dashboard />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
