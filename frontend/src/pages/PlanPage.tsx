import React, { useState } from "react";
import { BudgetsPage } from "./BudgetsPage";
import { GoalsPage } from "./GoalsPage";
import { DebtsPage } from "./DebtsPage";
import { PieChart, Target, CreditCard } from "lucide-react";

interface PlanPageProps {
  initialTab?: "budgets" | "goals" | "debts";
}

export const PlanPage: React.FC<PlanPageProps> = ({ initialTab = "budgets" }) => {
  const [activeTab, setActiveTab] = useState<"budgets" | "goals" | "debts">(initialTab);

  const tabs = [
    { id: "budgets" as const, label: "Budgets", icon: PieChart },
    { id: "goals" as const, label: "Goals", icon: Target },
    { id: "debts" as const, label: "Debts", icon: CreditCard },
  ];

  return (
    <div className="flex flex-col gap-4" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Segmented Sub-Tab Control */}
      <div
        className="glass-panel flex items-center justify-between"
        style={{
          padding: "6px",
          background: "var(--bg-surface)",
          borderRadius: "var(--radius-lg)",
          gap: "6px",
          width: "100%",
        }}
      >
        {tabs.map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="btn btn-sm"
              style={{
                flex: 1,
                minHeight: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                borderRadius: "var(--radius-md)",
                border: "none",
                background: isActive
                  ? "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)"
                  : "transparent",
                color: isActive ? "#ffffff" : "var(--text-secondary)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.18s ease",
              }}
            >
              <IconComp size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Active Plan Section */}
      <div style={{ width: "100%" }}>
        {activeTab === "budgets" && <BudgetsPage />}
        {activeTab === "goals" && <GoalsPage />}
        {activeTab === "debts" && <DebtsPage />}
      </div>
    </div>
  );
};
