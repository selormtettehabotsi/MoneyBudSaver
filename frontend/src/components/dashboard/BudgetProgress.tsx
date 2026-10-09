import React from "react";
import { CategoryExpenseBreakdown } from "../../types/finance";
import { Icon } from "../common/Icon";
import { useCurrency } from "../../context/CurrencyContext";
import { Button } from "../common/Button";
import { PieChart, ArrowUpRight } from "lucide-react";

interface BudgetProgressProps {
  breakdown: CategoryExpenseBreakdown[];
  onManageBudgets: () => void;
}

export const BudgetProgress: React.FC<BudgetProgressProps> = ({ breakdown, onManageBudgets }) => {
  const { formatMoney } = useCurrency();

  return (
    <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
              Top Spending Categories
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Current Month Distribution
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onManageBudgets}
            iconRight={<ArrowUpRight size={14} />}
          >
            Manage Budgets
          </Button>
        </div>

        {breakdown.length === 0 ? (
          <div
            style={{
              padding: "48px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "var(--bg-surface-solid)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
              }}
            >
              <PieChart size={20} />
            </div>
            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              No expenses recorded this month yet.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {breakdown.slice(0, 5).map((cat) => (
              <div key={cat.category_name} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        background: `${cat.color_hex}22`,
                        color: cat.color_hex,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={cat.icon_name} size={15} color={cat.color_hex} />
                    </div>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{cat.category_name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="tabular-nums" style={{ fontWeight: 600 }}>
                      {formatMoney(cat.total_amount)}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "999px",
                        background: "var(--bg-surface-solid)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {cat.percentage_of_total.toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div className="progress-bar-bg" style={{ height: "6px" }}>
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.max(2, cat.percentage_of_total))}%`,
                      background: cat.color_hex || "var(--accent-primary)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
