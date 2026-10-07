import React, { useEffect, useState } from "react";
import { analyticsApi } from "../api/analytics";
import { DashboardData } from "../types/finance";
import { MetricCards } from "../components/dashboard/MetricCards";
import { CashFlowChart } from "../components/dashboard/CashFlowChart";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { DebtTimeline } from "../components/dashboard/DebtTimeline";
import { DisclaimerBanner } from "../components/common/DisclaimerBanner";
import { ApiErrorCard } from "../components/common/ApiErrorCard";
import { useSync } from "../context/SyncContext";
import {
  PlusCircle,
  RefreshCw,
  Scale,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Info,
} from "lucide-react";

interface DashboardPageProps {
  onNavigate: (page: string) => void;
  onOpenNewTransaction: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onNavigate,
  onOpenNewTransaction,
}) => {
  const { loadCachedOrFetch } = useSync();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(true);

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

  if (loading && !data) {
    return (
      <div
        className="flex flex-col items-center justify-center"
        style={{ minHeight: "60dvh", gap: "12px" }}
      >
        <RefreshCw size={28} className="text-indigo-400" style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading financial dashboard...</span>
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

  return (
    <div className="flex flex-col gap-5" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Top Header & Actions */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px" }}>Financial Overview</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Real-time cash flow, runway, and council analytics
          </span>
        </div>

        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={loadData}
            title="Refresh"
            style={{ minHeight: "38px" }}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={() => onNavigate("council")}
            style={{ minHeight: "38px" }}
          >
            <Scale size={14} style={{ color: "var(--accent-secondary)" }} />
            <span>Ask Council</span>
          </button>
          <button
            className="btn btn-primary btn-sm flex items-center gap-1"
            onClick={onOpenNewTransaction}
            style={{ minHeight: "38px" }}
          >
            <PlusCircle size={14} />
            <span>New Txn</span>
          </button>
        </div>
      </div>

      {/* Financial Advice Disclaimer */}
      <DisclaimerBanner />

      {/* Insufficient Spending History Notice Banner */}
      {!data.has_sufficient_data && (
        <div
          className="glass-panel flex items-center gap-3"
          style={{
            padding: "12px 16px",
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          <Info size={18} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
          <span>
            <strong>Accumulating baseline spending data:</strong>{" "}
            {data.data_notice || "Add at least 2 weeks of spending for reliable advice."}
          </span>
        </div>
      )}

      {/* Top 4 Key Metric KPI Cards (Always visible first) */}
      <MetricCards data={data} />

      {/* Collapsible Toggle for Deep Charts on Mobile */}
      <div className="flex items-center justify-between" style={{ marginTop: "4px" }}>
        <div className="flex items-center gap-2">
          <BarChart2 size={18} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Trends, Budgets & Timeline</h3>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="btn btn-sm btn-secondary flex items-center gap-1"
          style={{ minHeight: "36px", fontSize: "12px" }}
          aria-label="Toggle analytics charts"
        >
          <span>{showDetails ? "Hide Charts" : "Show Charts"}</span>
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Collapsible Analytics Section */}
      {showDetails && (
        <div className="flex flex-col gap-6" style={{ width: "100%" }}>
          {/* Grid: 6-Month Trend Chart & Top Category Spend */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={{ width: "100%" }}>
            <CashFlowChart trendData={data.monthly_trend} />
            <BudgetProgress
              breakdown={data.category_breakdown}
              onManageBudgets={() => onNavigate("budgets")}
            />
          </div>

          {/* Hard Guardrails & Debt Timeline Panel */}
          <DebtTimeline
            guardrailWarnings={data.guardrail_warnings}
            onAskCouncil={() => onNavigate("council")}
          />
        </div>
      )}
    </div>
  );
};
