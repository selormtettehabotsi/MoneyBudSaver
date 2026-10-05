import React from "react";
import {
  LayoutDashboard,
  ReceiptText,
  PieChart,
  Target,
  CreditCard,
  Scale,
  Sparkles,
  Settings,
} from "lucide-react";

interface MobileNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentPage, onNavigate }) => {
  const items = [
    { id: "dashboard", label: "Overview", icon: LayoutDashboard },
    { id: "transactions", label: "History", icon: ReceiptText },
    { id: "council", label: "Council", icon: Scale, highlight: true },
    { id: "suggestions", label: "Review", icon: Sparkles },
    { id: "budgets", label: "Budgets", icon: PieChart },
    { id: "goals", label: "Goals", icon: Target },
    { id: "debts", label: "Debts", icon: CreditCard },
    { id: "settings", label: "More", icon: Settings },
  ];

  return (
    <nav
      className="mobile-bottom-nav glass-panel"
      style={{
        display: "none",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        borderRadius: "16px 16px 0 0",
        padding: "8px 6px",
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-color)",
        justifyContent: "space-around",
      }}
    >
      {items.map((item) => {
        const IconComponent = item.icon;
        const isActive = currentPage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              background: "transparent",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "2px",
              color: isActive
                ? "var(--accent-primary)"
                : item.highlight
                ? "var(--accent-secondary)"
                : "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            <IconComponent size={20} />
            <span style={{ fontSize: "10px", fontWeight: isActive ? 700 : 500 }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
