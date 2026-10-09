import React, { useEffect, useState } from "react";
import { analyticsApi } from "../api/analytics";
import { DashboardData } from "../types/finance";
import { MetricCards } from "../components/dashboard/MetricCards";
import { CashFlowChart } from "../components/dashboard/CashFlowChart";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { DebtTimeline } from "../components/dashboard/DebtTimeline";
import { ApiErrorCard } from "../components/common/ApiErrorCard";
import { Button } from "../components/common/Button";
import { LoadingProgress } from "../components/common/LoadingProgress";
import { useSync } from "../context/SyncContext";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import {
  PlusCircle,
  RefreshCw,
  Scale,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Info,
  TrendingUp,
  TrendingDown,
  ReceiptText,
  PieChart,
  Target,
  CreditCard,
  X,
} from "lucide-react";

interface DashboardPageProps {
  onNavigate: (page: string) => void;
  onOpenNewTransaction: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenNewTransaction,
}) => {
  const { user } = useAuth();
  const { formatMoney } = useCurrency();
  const { loadCachedOrFetch } = useSync();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  // Remember show/hide charts preference
  const [showCharts, setShowCharts] = useState<boolean>(() => {
    return localStorage.getItem("mc_show_charts") !== "false";
  });

  const [dismissNotice, setDismissNotice] = useState<boolean>(false);

  const toggleCharts = () => {
    setShowCharts((prev) => {
      const next = !prev;
      localStorage.setItem("mc_show_charts", String(next));
      return next;
    });
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setErrorRequestId(null);
    try {
      const res = await loadCachedOrFetch(
        "dashboard_summary",
        () => analyticsApi.getDashboard(),
        (cached) => {
          if (cached) setData(cached);
        }
      );
      if (res) {
        setData(res);
      }
    } catch (err: any) {
      if (!data) {
        setError(err.message || "Failed to load dashboard data.");
        setErrorRequestId(err.requestId || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for custom event from QuickAddModal
    const handleTxAdded = () => loadData();
    window.addEventListener("mc_transaction_added", handleTxAdded);
    return () => window.removeEventListener("mc_transaction_added", handleTxAdded);
  }, []);

  // Time-aware greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  if (loading && !data) {
    return (
      <div
        style={{
          minHeight: "60dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
        }}
      >
        <LoadingProgress
          message="Loading your financial overview..."
          subMessage="Aggregating monthly cashflow, savings targets, and debt trajectories..."
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <ApiErrorCard
        title="Dashboard Unavailable"
        message={error || "Unable to retrieve real-time financial metrics."}
        requestId={errorRequestId}
        onRetry={loadData}
        isRetrying={loading}
      />
    );
  }

  // Check if brand new user with 0 transactions
  const isFirstRun =
    (!data.monthly_trend || data.monthly_trend.length === 0) &&
    (!data.category_breakdown || data.category_breakdown.length === 0) &&
    parseFloat(data.total_income_current_month || "0") === 0 &&
    parseFloat(data.total_expense_current_month || "0") === 0;

  const netNum = parseFloat(data.net_cashflow_current_month || "0");
  const isNetPositive = netNum >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      {/* Top Header & Fast Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "clamp(1.5rem, 3.5vw, 1.875rem)",
              fontWeight: 800,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            {getGreeting()}{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Here is your current financial standing and council intelligence.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={loadData}
            icon={<RefreshCw size={14} className={loading ? "animate-spin" : undefined} />}
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onNavigate("council")}
            icon={<Scale size={14} style={{ color: "var(--accent-secondary)" }} />}
          >
            Ask Council
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenNewTransaction}
            icon={<PlusCircle size={15} />}
          >
            New Transaction
          </Button>
        </div>
      </div>

      {/* Slim Dismissible Baseline Notice */}
      {!data.has_sufficient_data && !dismissNotice && (
        <div
          className="glass-panel"
          style={{
            padding: "10px 16px",
            background: "var(--accent-primary-glow)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: "var(--radius-md)",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Info size={16} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
            <span>
              <strong>Building baseline history:</strong>{" "}
              {data.data_notice || "Track 2+ weeks of transactions for deep predictive intelligence."}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDismissNotice(true)}
            aria-label="Dismiss notice"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Hero Monthly Cash Flow Card */}
      <div
        className="glass-panel"
        style={{
          padding: "24px 28px",
          background: "linear-gradient(135deg, var(--bg-surface-solid) 0%, var(--bg-surface) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "20px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
            }}
          >
            Net Cash Flow This Month
          </span>
          <div
            className="tabular-nums"
            style={{
              fontSize: "clamp(2rem, 5vw, 2.75rem)",
              fontWeight: 800,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              color: isNetPositive ? "var(--success)" : "var(--danger)",
              lineHeight: 1.1,
              marginTop: "4px",
            }}
          >
            {isNetPositive ? "+" : ""}
            {formatMoney(data.net_cashflow_current_month)}
          </div>
        </div>

        <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "var(--success-bg)",
                color: "var(--success)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrendingUp size={18} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Total In</div>
              <div className="tabular-nums" style={{ fontSize: "16px", fontWeight: 700 }}>
                {formatMoney(data.total_income_current_month)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "var(--danger-bg)",
                color: "var(--danger)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TrendingDown size={18} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>Total Out</div>
              <div className="tabular-nums" style={{ fontSize: "16px", fontWeight: 700 }}>
                {formatMoney(data.total_expense_current_month)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* First-Run Onboarding Checklist State */}
      {isFirstRun ? (
        <div
          className="glass-panel"
          style={{
            padding: "36px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span className="badge badge-brand">Get Started</span>
            </div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, fontFamily: "var(--font-display)" }}>
              Welcome to your financial command center
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Complete these steps to unlock multi-model AI Council deliberation and deep health analytics:
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "14px",
            }}
          >
            <div
              className="glass-panel"
              onClick={onOpenNewTransaction}
              style={{
                padding: "18px 20px",
                cursor: "pointer",
                background: "var(--bg-surface-solid)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <ReceiptText size={20} style={{ color: "var(--accent-primary)" }} />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>1. Add First Transaction</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Log income or expenses, or import your mobile money bank statement (.csv).
              </p>
            </div>

            <div
              className="glass-panel"
              onClick={() => onNavigate("budgets")}
              style={{
                padding: "18px 20px",
                cursor: "pointer",
                background: "var(--bg-surface-solid)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <PieChart size={20} style={{ color: "var(--accent-secondary)" }} />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>2. Set Category Budgets</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Configure monthly limits for groceries, rent, and discretionary spend.
              </p>
            </div>

            <div
              className="glass-panel"
              onClick={() => onNavigate("goals")}
              style={{
                padding: "18px 20px",
                cursor: "pointer",
                background: "var(--bg-surface-solid)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <Target size={20} style={{ color: "var(--success)" }} />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>3. Create Savings Goal</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Establish an emergency fund target or save towards a milestone purchase.
              </p>
            </div>

            <div
              className="glass-panel"
              onClick={() => onNavigate("debts")}
              style={{
                padding: "18px 20px",
                cursor: "pointer",
                background: "var(--bg-surface-solid)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <CreditCard size={20} style={{ color: "var(--warning)" }} />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>4. Record Outstanding Debts</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Track loan balances and monthly minimum payments to calibrate DTI safety.
              </p>
            </div>

            <div
              className="glass-panel"
              onClick={() => onNavigate("council")}
              style={{
                padding: "18px 20px",
                cursor: "pointer",
                background: "var(--bg-surface-solid)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                <Scale size={20} style={{ color: "var(--accent-purple)" }} />
                <span style={{ fontWeight: 700, fontSize: "15px" }}>5. Ask the AI Council</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                Test your prospective purchase or borrowing plans against ensemble AI models.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Top 4 KPI Cards */}
          <MetricCards data={data} />

          {/* Toggle Analytics Button */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <BarChart2 size={18} style={{ color: "var(--accent-primary)" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
                Trends & Budget Distribution
              </h3>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleCharts}
              iconRight={showCharts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            >
              {showCharts ? "Hide Charts" : "Show Charts"}
            </Button>
          </div>

          {/* Side-by-Side Charts on Desktop (Fixes Bug #6) */}
          {showCharts && (
            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-5"
              style={{ width: "100%" }}
            >
              <CashFlowChart trendData={data.monthly_trend} />
              <BudgetProgress
                breakdown={data.category_breakdown}
                onManageBudgets={() => onNavigate("budgets")}
              />
            </div>
          )}

          {/* Financial Health Guardrails & Breaches Panel */}
          <DebtTimeline
            guardrailWarnings={data.guardrail_warnings}
            onAskCouncil={() => onNavigate("council")}
          />
        </>
      )}
    </div>
  );
};
