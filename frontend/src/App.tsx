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
import { BudgetsPage } from "./pages/BudgetsPage";
import { GoalsPage } from "./pages/GoalsPage";
import { DebtsPage } from "./pages/DebtsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { RefreshCw } from "lucide-react";

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [currentPage, setCurrentPage] = useState<string>("dashboard");

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
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
      case "budgets":
        return <BudgetsPage />;
      case "goals":
        return <GoalsPage />;
      case "debts":
        return <DebtsPage />;
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
            <AppContent />
          </AuthProvider>
        </ServerStatusProvider>
      </CurrencyProvider>
    </ThemeProvider>
  );
};

export default App;
