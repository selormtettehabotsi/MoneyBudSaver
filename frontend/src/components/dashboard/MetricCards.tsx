import React from "react";
import { TrendingUp, TrendingDown, Clock, CreditCard, PiggyBank, Info } from "lucide-react";
import { useCurrency } from "../../context/CurrencyContext";
import { DashboardData } from "../../types/finance";
import {
  formatRunway,
  getRunwayStatus,
  getRunwayNotice,
  formatDTI,
  getDTIStatus,
  formatSavingsRate,
} from "../../utils/formatters";

interface MetricCardsProps {
  data: DashboardData;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ data }) => {
  const { formatMoney } = useCurrency();
  const netNum = parseFloat(data.net_cashflow_current_month || "0");
  const isNetPositive = netNum >= 0;

  // DTI Status & Formatting
  const dtiVal = data.debt_to_income_ratio;
  const dtiBadge = getDTIStatus(dtiVal);

  // Runway Status & Formatting
  const hasSufficient = data.has_sufficient_data !== false;
  const runwayBadge = getRunwayStatus(data.runway_months, hasSufficient);
  const runwayDisplay = formatRunway(data.runway_months, data.runway_display, hasSufficient);
  const runwayNotice = getRunwayNotice(hasSufficient, data.data_notice);

  const savingsRateDisplay = formatSavingsRate(data.savings_rate_percentage);
  const isSavingsOnTarget = (data.savings_rate_percentage ?? 0) >= 20;

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
          position: "relative",
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
            fontSize: hasSufficient ? "clamp(1.15rem, 3.8vw, 1.5rem)" : "clamp(0.95rem, 2.5vw, 1.15rem)",
            fontWeight: 800,
            color: hasSufficient ? "var(--text-primary)" : "var(--text-secondary)",
            letterSpacing: "-0.02em",
          }}
        >
          {runwayDisplay}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px", gap: "4px" }}>
          {hasSufficient ? (
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} title={formatMoney(data.total_liquid_savings)}>
              {formatMoney(data.total_liquid_savings)}
            </span>
          ) : (
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--brand-accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                maxWidth: "140px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={runwayNotice || "Add at least 2 weeks of spending for reliable advice."}
            >
              <Info size={11} style={{ flexShrink: 0 }} />
              2+ wks needed
            </span>
          )}
          <span className={`badge ${runwayBadge.badgeClass}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {runwayBadge.label}
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
          {savingsRateDisplay}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Target: 20%</span>
          <span className={`badge ${isSavingsOnTarget ? "badge-success" : "badge-warning"}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {isSavingsOnTarget ? "On Target" : "Under"}
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
              background: dtiBadge.status === "danger" ? "var(--danger-bg)" : "rgba(245, 158, 11, 0.12)",
              color: dtiBadge.status === "danger" ? "var(--danger)" : "var(--warning)",
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
          {formatDTI(dtiVal)}
        </div>
        <div className="flex items-center justify-between" style={{ marginTop: "8px" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }} title={formatMoney(data.total_debt_balance)}>
            Debt: {formatMoney(data.total_debt_balance)}
          </span>
          <span className={`badge ${dtiBadge.badgeClass}`} style={{ fontSize: "0.7rem", padding: "2px 6px" }}>
            {dtiBadge.label}
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

