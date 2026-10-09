import React, { useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ServerStatusProvider } from "./context/ServerStatusContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { SyncProvider } from "./context/SyncContext";
import { PinLockProvider } from "./context/PinLockContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmDialogProvider } from "./context/ConfirmDialogContext";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { PlanPage } from "./pages/PlanPage";
import { CouncilPage } from "./pages/CouncilPage";
import { MorePage } from "./pages/MorePage";
import { SuggestionsPage } from "./pages/SuggestionsPage";
import { DataPage } from "./pages/DataPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PinLockScreen } from "./components/common/PinLockScreen";
import { PwaUpdatePrompt } from "./components/common/PwaUpdatePrompt";
import { LoadingScreen } from "./components/common/LoadingScreen";

// Global navigation bridge preserving window.__navigateTo for legacy components
const NavigationBridge: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    (window as any).__navigateTo = (page: string) => {
      if (page === "budgets") navigate("/plan/budgets");
      else if (page === "goals") navigate("/plan/goals");
      else if (page === "debts") navigate("/plan/debts");
      else if (page === "suggestions") navigate("/review");
      else if (page === "plan") navigate("/plan/budgets");
      else if (page.startsWith("/")) navigate(page);
      else navigate(`/${page}`);
    };
  }, [navigate]);

  return null;
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return <LoadingScreen onTimeoutSkip={() => navigate("/login")} />;
  }

  // Unauthenticated Views
  if (!user) {
    return (
      <>
        <NavigationBridge />
        <Routes>
          <Route path="/register" element={<RegisterPage onNavigateToLogin={() => navigate("/login")} />} />
          <Route path="/login" element={<LoginPage onNavigateToRegister={() => navigate("/register")} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    );
  }

  const handleNavigateToCouncil = (prefillQuery?: string) => {
    if (prefillQuery) {
      navigate("/council", { state: { initialQuestion: prefillQuery } });
    } else {
      navigate("/council");
    }
  };

  const councilStateQuestion = (location.state as any)?.initialQuestion;

  return (
    <>
      <NavigationBridge />
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                onNavigate={(page) => (window as any).__navigateTo(page)}
                onOpenNewTransaction={() => navigate("/transactions")}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                onNavigate={(page) => (window as any).__navigateTo(page)}
                onOpenNewTransaction={() => navigate("/transactions")}
              />
            }
          />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/plan" element={<Navigate to="/plan/budgets" replace />} />
          <Route path="/plan/budgets" element={<PlanPage />} />
          <Route path="/plan/goals" element={<PlanPage />} />
          <Route path="/plan/debts" element={<PlanPage />} />
          <Route
            path="/council"
            element={<CouncilPage initialQuestion={councilStateQuestion} key={councilStateQuestion || "council-default"} />}
          />
          <Route
            path="/council/:decisionId"
            element={<CouncilPage key={location.pathname} />}
          />
          <Route
            path="/review"
            element={<SuggestionsPage onNavigateToCouncil={handleNavigateToCouncil} />}
          />
          <Route path="/suggestions" element={<Navigate to="/review" replace />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:section" element={<SettingsPage />} />
          <Route path="/more" element={<MorePage onNavigate={(p) => (window as any).__navigateTo(p)} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <ServerStatusProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <AuthProvider>
                <SyncProvider>
                  <PinLockProvider>
                    <BrowserRouter>
                      <AppContent />
                      <PinLockScreen />
                      <PwaUpdatePrompt />
                    </BrowserRouter>
                  </PinLockProvider>
                </SyncProvider>
              </AuthProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </ServerStatusProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
};

export default App;
