import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import Approvals from "./pages/Approvals";
import PaymentQueue from "./pages/PaymentQueue";
import PettyCash from "./pages/PettyCash";
import BankPayments from "./pages/BankPayments";
import BudgetPlanning from "./pages/BudgetPlanning";
import BudgetPeriods from "./pages/BudgetPeriods";
import BudgetTransfer from "./pages/BudgetTransfer";
import Divisions from "./pages/Divisions";
import Categories from "./pages/Categories";
import FundingSources from "./pages/FundingSources";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import DocumentTemplates from "./pages/DocumentTemplates";
import Reports from "./pages/Reports";
import AuditLogs from "./pages/AuditLogs";
import NotificationHistory from "./pages/NotificationHistory";
import SessionManagement from "./pages/SessionManagement";
import CashAdvance from "./pages/CashAdvance";
import CashAdvanceForm from "./pages/CashAdvanceForm";
import CashAdvanceDetail from "./pages/CashAdvanceDetail";
import CashAdvanceSettlementForm from "./pages/CashAdvanceSettlementForm";
import MedicalReimbursement from "./pages/MedicalReimbursement";
import MedicalReimbursementForm from "./pages/MedicalReimbursementForm";
import MedicalReimbursementDetail from "./pages/MedicalReimbursementDetail";
import EmployeeMedicalBudgets from "./pages/EmployeeMedicalBudgets";
import Adjustments from "./pages/Adjustments";
import BackupRestore from "./pages/BackupRestore";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/layout/AppLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
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
                <Route path="/cash-advance" element={<CashAdvance />} />
                <Route path="/cash-advance/new" element={<CashAdvanceForm />} />
                <Route path="/cash-advance/:id" element={<CashAdvanceDetail />} />
                <Route path="/cash-advance/:id/settlement/new" element={<CashAdvanceSettlementForm />} />
                <Route path="/cash-advance/:id/settlement/:settlementId/edit" element={<CashAdvanceSettlementForm />} />
                <Route path="/medical-reimbursement" element={<MedicalReimbursement />} />
                <Route path="/medical-reimbursement/new" element={<MedicalReimbursementForm />} />
                <Route path="/medical-reimbursement/:id" element={<MedicalReimbursementDetail />} />
                <Route path="/medical-reimbursement/:id/edit" element={<MedicalReimbursementForm />} />
                <Route
                  path="/approvals"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <Approvals />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/payment-queue"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <PaymentQueue />
                    </ProtectedRoute>
                  }
                />
                <Route path="/petty-cash" element={
                  <ProtectedRoute requiredRole="admin">
                    <PettyCash />
                  </ProtectedRoute>
                } />
                <Route path="/bank-payments" element={
                  <ProtectedRoute requiredRole="admin">
                    <BankPayments />
                  </ProtectedRoute>
                } />
                <Route path="/budget-planning" element={<BudgetPlanning />} />
                <Route path="/budget-periods" element={
                  <ProtectedRoute requiredRole="admin">
                    <BudgetPeriods />
                  </ProtectedRoute>
                } />
                <Route path="/budget-transfer" element={<BudgetTransfer />} />
                <Route path="/adjustments" element={
                  <ProtectedRoute requiredRole="finance">
                    <Adjustments />
                  </ProtectedRoute>
                } />
                <Route path="/divisions" element={
                  <ProtectedRoute requiredRole="admin">
                    <Divisions />
                  </ProtectedRoute>
                } />
                <Route path="/categories" element={<Categories />} />
                <Route path="/funding-sources" element={
                  <ProtectedRoute requiredRole="admin">
                    <FundingSources />
                  </ProtectedRoute>
                } />
                <Route path="/users" element={
                  <ProtectedRoute requiredRole="admin">
                    <Users />
                  </ProtectedRoute>
                } />
                <Route path="/settings" element={
                  <ProtectedRoute requiredRole="admin">
                    <Settings />
                  </ProtectedRoute>
                } />
                <Route path="/document-templates" element={
                  <ProtectedRoute requiredRole="admin">
                    <DocumentTemplates />
                  </ProtectedRoute>
                } />
                <Route path="/reports" element={
                  <ProtectedRoute>
                    <Reports />
                  </ProtectedRoute>
                } />
                <Route path="/audit-logs" element={
                  <ProtectedRoute requiredRole="admin">
                    <AuditLogs />
                  </ProtectedRoute>
                } />
                <Route path="/notification-history" element={
                  <ProtectedRoute requiredRole="admin">
                    <NotificationHistory />
                  </ProtectedRoute>
                } />
                <Route path="/session-management" element={
                  <ProtectedRoute requiredRole="admin">
                    <SessionManagement />
                  </ProtectedRoute>
                } />
                <Route path="/employee-medical-budgets" element={
                  <ProtectedRoute requiredRole="super_admin">
                    <EmployeeMedicalBudgets />
                  </ProtectedRoute>
                } />
                <Route path="/backup-restore" element={
                  <ProtectedRoute requiredRole="super_admin">
                    <BackupRestore />
                  </ProtectedRoute>
                } />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
