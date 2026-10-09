import React from "react";
import { TrendingUp, TrendingDown, Clock, CreditCard, PiggyBank } from "lucide-react";
import { useCurrency } from "../../context/CurrencyContext";
import { DashboardData } from "../../types/finance";
import {
  formatRunway,
  getRunwayStatus,
  formatDTI,
  getDTIStatus,
  formatSavingsRate,
} from "../../utils/formatters";
import { StatCard } from "../common/StatCard";

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

  // Savings rate
  const savingsRateDisplay = formatSavingsRate(data.savings_rate_percentage);
  const isSavingsOnTarget = (data.savings_rate_percentage ?? 0) >= 20;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      style={{ marginBottom: "24px" }}
    >
      {/* 1. Monthly Net Cash Flow */}
      <StatCard
        label="Net Cash Flow"
        value={`${isNetPositive ? "+" : ""}${formatMoney(data.net_cashflow_current_month)}`}
        badgeText={isNetPositive ? "Surplus" : "Deficit"}
        badgeVariant={isNetPositive ? "success" : "danger"}
        icon={isNetPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        subtitle={`In: ${formatMoney(data.total_income_current_month)} · Out: ${formatMoney(data.total_expense_current_month)}`}
        explanation="Monthly income minus expenses"
      />

      {/* 2. Financial Runway */}
      <StatCard
        label="Runway Buffer"
        value={runwayDisplay}
        badgeText={runwayBadge.label}
        badgeVariant={runwayBadge.status}
        icon={<Clock size={18} />}
        subtitle={
          hasSufficient
            ? `${runwayBadge.label} buffer at current burn`
            : "Needs 2+ weeks spending"
        }
        explanation="How many months your savings last if all income stops"
      />

      {/* 3. Savings Rate */}
      <StatCard
        label="Savings Rate"
        value={savingsRateDisplay}
        badgeText={isSavingsOnTarget ? "On Target (≥20%)" : "Under Target (<20%)"}
        badgeVariant={isSavingsOnTarget ? "success" : "warning"}
        icon={<PiggyBank size={18} />}
        subtitle={`Target: 20% · Current: ${savingsRateDisplay}`}
        explanation="Portion of monthly income saved or invested"
      />

      {/* 4. Debt-to-Income (DTI) */}
      <StatCard
        label="Debt-to-Income"
        value={formatDTI(dtiVal)}
        badgeText={dtiBadge.label}
        badgeVariant={dtiBadge.status}
        icon={<CreditCard size={18} />}
        subtitle={
          dtiVal !== null && dtiVal !== undefined
            ? `Debt payments vs income (Safe ≤25%)`
            : "No active debts recorded"
        }
        explanation="Percentage of gross monthly income allocated to debt payments"
      />
    </div>
  );
};
