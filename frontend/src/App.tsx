import React, { useState } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { ServerStatusProvider } from "./context/ServerStatusContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
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
import { SyncProvider } from "./context/SyncContext";
import { PinLockProvider } from "./context/PinLockContext";
import { PinLockScreen } from "./components/common/PinLockScreen";
import { PwaUpdatePrompt } from "./components/common/PwaUpdatePrompt";
import { RefreshCw } from "lucide-react";

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [currentPage, setCurrentPage] = useState<string>("dashboard");
  const [councilPrefill, setCouncilPrefill] = useState<string>("");

  React.useEffect(() => {
    (window as any).__navigateTo = setCurrentPage;
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          background: "var(--bg-primary)",
        }}
      >
        <img src="/favicon.svg" alt="Logo" style={{ width: "48px", height: "48px" }} />
        <RefreshCw size={24} className="text-indigo-400" style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading MoneyCouncil...</span>
      </div>
    );
  }

  // Unauthenticated Views
  if (!user) {
    if (authView === "register") {
      return <RegisterPage onNavigateToLogin={() => setAuthView("login")} />;
    }
    return <LoginPage onNavigateToRegister={() => setAuthView("register")} />;
  }

  const navigateToCouncilWithQuery = (query?: string) => {
    if (query) setCouncilPrefill(query);
    setCurrentPage("council");
  };

  // Authenticated Application Views
  const renderCurrentPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <DashboardPage
            onNavigate={setCurrentPage}
            onOpenNewTransaction={() => setCurrentPage("transactions")}
          />
        );
      case "transactions":
        return <TransactionsPage />;
      case "council":
        return <CouncilPage initialQuestion={councilPrefill} key={councilPrefill} />;
      case "plan":
        return <PlanPage initialTab="budgets" />;
      case "budgets":
        return <PlanPage initialTab="budgets" />;
      case "goals":
        return <PlanPage initialTab="goals" />;
      case "debts":
        return <PlanPage initialTab="debts" />;
      case "more":
        return <MorePage onNavigate={setCurrentPage} />;
      case "suggestions":
        return <SuggestionsPage onNavigateToCouncil={navigateToCouncilWithQuery} />;
      case "data":
        return <DataPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return (
          <DashboardPage
            onNavigate={setCurrentPage}
            onOpenNewTransaction={() => setCurrentPage("transactions")}
          />
        );
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderCurrentPage()}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <ServerStatusProvider>
          <AuthProvider>
            <SyncProvider>
              <PinLockProvider>
                <AppContent />
                <PinLockScreen />
                <PwaUpdatePrompt />
              </PinLockProvider>
            </SyncProvider>
          </AuthProvider>
        </ServerStatusProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
};

export default App;
