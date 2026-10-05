import React, { useEffect, useState } from "react";
import { analyticsApi } from "../api/analytics";
import { DashboardData } from "../types/finance";
import { MetricCards } from "../components/dashboard/MetricCards";
import { CashFlowChart } from "../components/dashboard/CashFlowChart";
import { BudgetProgress } from "../components/dashboard/BudgetProgress";
import { DebtTimeline } from "../components/dashboard/DebtTimeline";
import { DisclaimerBanner } from "../components/common/DisclaimerBanner";
import { PlusCircle, RefreshCw, Scale } from "lucide-react";

interface DashboardPageProps {
  onNavigate: (page: string) => void;
  onOpenNewTransaction: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate, onOpenNewTransaction }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getDashboard();
      setData(res);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "60vh", gap: "12px" }}>
        <RefreshCw size={28} className="text-indigo-400" style={{ animation: "spin 1s linear infinite" }} />
        <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Loading financial dashboard...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel" style={{ padding: "32px", textAlign: "center" }}>
        <p style={{ color: "var(--danger)", marginBottom: "16px" }}>{error || "Unable to load data."}</p>
        <button className="btn btn-primary btn-sm" onClick={loadData}>
          <RefreshCw size={14} />
          <span>Try Again</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%" }}>
      {/* Top Header & Actions */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>Financial Overview</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Real-time cash flow, runway, and council analytics
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button className="btn btn-secondary btn-sm" onClick={loadData} title="Refresh">
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate("council")}>
            <Scale size={15} style={{ color: "var(--accent-secondary)" }} />
            <span>Ask Council</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenNewTransaction}>
            <PlusCircle size={15} />
            <span>New Transaction</span>
          </button>
        </div>
      </div>

      {/* Financial Advice Disclaimer */}
      <DisclaimerBanner />

      {/* Top 4 Metric KPI Cards */}
      <MetricCards data={data} />

      {/* Grid: 6-Month Trend Chart & Top Category Spend */}
      <div className="grid grid-cols-2 gap-6">
        <CashFlowChart trendData={data.monthly_trend} />
        <BudgetProgress breakdown={data.category_breakdown} onManageBudgets={() => onNavigate("budgets")} />
      </div>

      {/* Hard Guardrails & Debt Timeline Panel */}
      <DebtTimeline
        guardrailWarnings={data.guardrail_warnings}
        onAskCouncil={() => onNavigate("council")}
      />
    </div>
  );
};
