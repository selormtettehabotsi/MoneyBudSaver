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
    <div className="metrics-grid" style={{ marginBottom: "24px" }}>
      {/* 1. Monthly Net Cash Flow */}
      <div
        className="glass-panel"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "140px",
          minWidth: 0,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Cash Flow
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: isNetPositive ? "var(--success-bg)" : "var(--danger-bg)",
              color: isNetPositive ? "var(--success)" : "var(--danger)",
              flexShrink: 0,
            }}
          >
            {isNetPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>
        </div>
        <div
          className="tabular-nums"
          style={{
            fontSize: "clamp(1.15rem, 3.8vw, 1.5rem)",
            fontWeight: 800,
            color: isNetPositive ? "var(--success)" : "var(--danger)",
            letterSpacing: "-0.02em",
            wordBreak: "break-word",
          }}
        >
          {isNetPositive ? "+" : ""}
          {formatMoney(data.net_cashflow_current_month)}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <span title={formatMoney(data.total_income_current_month)}>In: {formatMoney(data.total_income_current_month)}</span>
          <span title={formatMoney(data.total_expense_current_month)}>Out: {formatMoney(data.total_expense_current_month)}</span>
        </div>
      </div>

      {/* 2. Financial Runway */}
      <div
        className="glass-panel"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "140px",
          minWidth: 0,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Runway
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(6, 182, 212, 0.12)",
              color: "var(--accent-secondary)",
              flexShrink: 0,
            }}
          >
            <Clock size={16} />
          </div>
        </div>
        <div
          className="tabular-nums"
          style={{
            fontSize: "clamp(1.15rem, 3.8vw, 1.5rem)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          {runway >= 990 ? "99+ mo" : `${runway.toFixed(1)} mo`}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} title={formatMoney(data.total_liquid_savings)}>
            {formatMoney(data.total_liquid_savings)}
          </span>
          <span className={`badge badge-${runwayStatus}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {runwayStatus === "success" ? "Healthy" : runwayStatus === "warning" ? "Moderate" : "Low"}
          </span>
        </div>
      </div>

      {/* 3. Savings Rate */}
      <div
        className="glass-panel"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "140px",
          minWidth: 0,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Savings Rate
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(99, 102, 241, 0.12)",
              color: "var(--accent-primary)",
              flexShrink: 0,
            }}
          >
            <PiggyBank size={16} />
          </div>
        </div>
        <div
          className="tabular-nums"
          style={{
            fontSize: "clamp(1.15rem, 3.8vw, 1.5rem)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          {data.savings_rate_percentage?.toFixed(1) || "0.0"}%
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Target: 20%</span>
          <span className={`badge ${data.savings_rate_percentage >= 20 ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {data.savings_rate_percentage >= 20 ? "On Target" : "Under"}
          </span>
        </div>
      </div>

      {/* 4. Debt-to-Income (DTI) */}
      <div
        className="glass-panel"
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minHeight: "140px",
          minWidth: 0,
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "8px" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)" }}>
            Debt (DTI)
          </span>
          <div
            style={{
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              background: dtiStatus === "danger" ? "var(--danger-bg)" : "rgba(245, 158, 11, 0.12)",
              color: dtiStatus === "danger" ? "var(--danger)" : "var(--warning)",
              flexShrink: 0,
            }}
          >
            <CreditCard size={16} />
          </div>
        </div>
        <div
          className="tabular-nums"
          style={{
            fontSize: "clamp(1.15rem, 3.8vw, 1.5rem)",
            fontWeight: 800,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
          }}
        >
          {dti.toFixed(1)}%
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} title={formatMoney(data.total_debt_balance)}>
            Debt: {formatMoney(data.total_debt_balance)}
          </span>
          <span className={`badge badge-${dtiStatus}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {dtiStatus === "success" ? "Safe" : dtiStatus === "warning" ? "Caution" : "Critical"}
          </span>
        </div>
      </div>

      <style>{`
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          width: 100%;
        }
        @media (max-width: 1024px) {
          .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 12px !important;
          }
        }
        @media (max-width: 640px) {
          .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
        }
        @media (max-width: 380px) {
          .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
          }
          .metrics-grid .glass-panel {
            padding: 12px 10px !important;
            min-height: 125px !important;
          }
        }
      `}</style>
    </div>
  );
};

