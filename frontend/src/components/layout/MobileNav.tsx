import React from "react";
import {
  LayoutDashboard,
  ReceiptText,
  Scale,
  PieChart,
  Menu,
} from "lucide-react";

interface MobileNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentPage, onNavigate }) => {
  // Map sub-pages to their parent bottom nav tab
  const getActiveTab = () => {
    if (currentPage === "dashboard") return "dashboard";
    if (currentPage === "transactions") return "transactions";
    if (currentPage === "council") return "council";
    if (["plan", "budgets", "goals", "debts"].includes(currentPage)) return "plan";
    if (["more", "suggestions", "data", "settings"].includes(currentPage)) return "more";
    return "dashboard";
  };

  const activeTab = getActiveTab();

  const items = [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "transactions", label: "Txns", icon: ReceiptText },
    { id: "council", label: "Council", icon: Scale, highlight: true },
    { id: "plan", label: "Plan", icon: PieChart },
    { id: "more", label: "More", icon: Menu },
  ];

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label="Mobile Navigation"
      style={{
        display: "none",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 500,
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border-color)",
        paddingTop: "6px",
        paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "8px",
        paddingRight: "8px",
        justifyContent: "space-around",
        alignItems: "center",
        boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.2)",
      }}
    >
      {items.map((item) => {
        const IconComponent = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="mobile-tab-btn"
            style={{
              background: "transparent",
              border: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              minWidth: "48px",
              minHeight: "44px",
              color: isActive
                ? "var(--accent-primary)"
                : item.highlight
                ? "var(--accent-secondary)"
                : "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px",
              position: "relative",
              transition: "color 0.15s ease",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "6px",
                background: isActive ? "var(--accent-primary-glow)" : "transparent",
                transition: "background 0.15s ease",
              }}
            >
              <IconComponent size={20} />
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "-0.01em",
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
