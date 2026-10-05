import React from "react";
import { TrendingUp, TrendingDown, Clock, CreditCard, PiggyBank } from "lucide-react";
import { useCurrency } from "../../context/CurrencyContext";
import { DashboardData } from "../../types/finance";

interface MetricCardsProps {
  data: DashboardData;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ data }) => {
  const { formatMoney } = useCurrency();
  const netNum = parseFloat(data.net_cashflow_current_month || "0");
  const isNetPositive = netNum >= 0;

  // DTI Status
  const dti = data.debt_to_income_ratio || 0;
  const dtiStatus = dti > 40 ? "danger" : dti > 25 ? "warning" : "success";

  // Runway Status
  const runway = data.runway_months || 0;
  const runwayStatus = runway < 3 ? "danger" : runway < 6 ? "warning" : "success";

  return (
    <div className="grid grid-cols-4 gap-4" style={{ marginBottom: "24px" }}>
      {/* 1. Monthly Net Cash Flow */}
      <div className="glass-panel" style={{ padding: "18px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
            Monthly Cash Flow
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: isNetPositive ? "var(--success-bg)" : "var(--danger-bg)",
              color: isNetPositive ? "var(--success)" : "var(--danger)",
            }}
          >
            {isNetPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>
        </div>
        <div style={{ fontSize: "24px", fontWeight: 800, color: isNetPositive ? "var(--success)" : "var(--danger)", letterSpacing: "-0.03em" }}>
          {isNetPositive ? "+" : ""}
          {formatMoney(data.net_cashflow_current_month)}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-muted)" }}>
          <span>In: {formatMoney(data.total_income_current_month)}</span>
          <span>Out: {formatMoney(data.total_expense_current_month)}</span>
        </div>
      </div>

      {/* 2. Financial Runway */}
      <div className="glass-panel" style={{ padding: "18px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
            Liquid Runway
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(6, 182, 212, 0.12)",
              color: "var(--accent-secondary)",
            }}
          >
            <Clock size={16} />
          </div>
        </div>
        <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          {runway >= 990 ? "99+ mo" : `${runway.toFixed(1)} mo`}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Savings: {formatMoney(data.total_liquid_savings)}
          </span>
          <span className={`badge badge-${runwayStatus}`}>
            {runwayStatus === "success" ? "Healthy" : runwayStatus === "warning" ? "Moderate" : "Low"}
          </span>
        </div>
      </div>

      {/* 3. Savings Rate */}
      <div className="glass-panel" style={{ padding: "18px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
            Savings Rate
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(99, 102, 241, 0.12)",
              color: "var(--accent-primary)",
            }}
          >
            <PiggyBank size={16} />
          </div>
        </div>
        <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          {data.savings_rate_percentage?.toFixed(1) || "0.0"}%
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Target: 20.0%+</span>
          <span className={`badge ${data.savings_rate_percentage >= 20 ? "badge-success" : "badge-warning"}`}>
            {data.savings_rate_percentage >= 20 ? "On Target" : "Under Target"}
          </span>
        </div>
      </div>

      {/* 4. Debt-to-Income (DTI) */}
      <div className="glass-panel" style={{ padding: "18px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
            Debt Ratio (DTI)
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: dtiStatus === "danger" ? "var(--danger-bg)" : "rgba(245, 158, 11, 0.12)",
              color: dtiStatus === "danger" ? "var(--danger)" : "var(--warning)",
            }}
          >
            <CreditCard size={16} />
          </div>
        </div>
        <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
          {dti.toFixed(1)}%
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "10px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Debt: {formatMoney(data.total_debt_balance)}
          </span>
          <span className={`badge badge-${dtiStatus}`}>
            {dtiStatus === "success" ? "Safe" : dtiStatus === "warning" ? "Caution" : "Critical"}
          </span>
        </div>
      </div>
    </div>
  );
};
