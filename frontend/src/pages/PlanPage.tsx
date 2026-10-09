import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BudgetsPage } from "./BudgetsPage";
import { GoalsPage } from "./GoalsPage";
import { DebtsPage } from "./DebtsPage";
import { PieChart, Target, CreditCard } from "lucide-react";
import { SegmentedControl, SegmentOption } from "../components/common/SegmentedControl";

export const PlanPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL path
  const getActiveTab = (): "budgets" | "goals" | "debts" => {
    if (location.pathname.includes("/goals")) return "goals";
    if (location.pathname.includes("/debts")) return "debts";
    return "budgets";
  };

  const activeTab = getActiveTab();

  const handleTabChange = (tabId: "budgets" | "goals" | "debts") => {
    navigate(`/plan/${tabId}`);
  };

  const options: SegmentOption<"budgets" | "goals" | "debts">[] = [
    { id: "budgets", label: "Budgets & Limits", icon: <PieChart size={16} /> },
    { id: "goals", label: "Savings Goals", icon: <Target size={16} /> },
    { id: "debts", label: "Debts & Loans", icon: <CreditCard size={16} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* URL-synced Segmented Sub-Tab Control (Fixes Bug #1) */}
      <div style={{ display: "flex", justifyContent: "flex-start", width: "100%" }}>
        <SegmentedControl<"budgets" | "goals" | "debts">
          options={options}
          value={activeTab}
          onChange={handleTabChange}
          size="md"
        />
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
