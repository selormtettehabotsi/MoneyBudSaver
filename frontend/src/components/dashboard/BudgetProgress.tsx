import React from "react";
import { CategoryExpenseBreakdown } from "../../types/finance";
import { Icon } from "../common/Icon";
import { useCurrency } from "../../context/CurrencyContext";

interface BudgetProgressProps {
  breakdown: CategoryExpenseBreakdown[];
  onManageBudgets: () => void;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({ breakdown, onManageBudgets }) => {
  const { formatMoney } = useCurrency();

  return (
    <div className="glass-panel" style={{ padding: "20px 24px" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
        <div>
          <h3 style={{ fontSize: "16px" }}>Top Spending Categories</h3>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Current Month Distribution</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onManageBudgets}>
          Manage Budgets
        </button>
      </div>

      {breakdown.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)" }}>
          No expenses recorded this month yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {breakdown.slice(0, 5).map((cat) => (
            <div key={cat.category_name} className="flex flex-col gap-1">
              <div className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: "26px",
                      height: "26px",
                      borderRadius: "6px",
                      background: `${cat.color_hex}25`,
                      color: cat.color_hex,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={cat.icon_name} size={14} color={cat.color_hex} />
                  </div>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cat.category_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 600 }}>{formatMoney(cat.total_amount)}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>({cat.percentage_of_total.toFixed(0)}%)</span>
                </div>
              </div>

              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${Math.min(100, cat.percentage_of_total)}%`,
                    background: cat.color_hex,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
