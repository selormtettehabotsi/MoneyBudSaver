import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ReceiptText,
  Scale,
  PieChart,
  Menu,
} from "lucide-react";

export const MobileNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const getActiveTab = () => {
    const p = location.pathname;
    if (p === "/" || p.startsWith("/dashboard")) return "dashboard";
    if (p.startsWith("/transactions")) return "transactions";
    if (p.startsWith("/council")) return "council";
    if (p.startsWith("/plan")) return "plan";
    if (p.startsWith("/more") || p.startsWith("/review") || p.startsWith("/data") || p.startsWith("/settings")) {
      return "more";
    }
    return "dashboard";
  };

  const activeTab = getActiveTab();

  const items = [
    { id: "dashboard", path: "/dashboard", label: "Home", icon: LayoutDashboard },
    { id: "transactions", path: "/transactions", label: "Txns", icon: ReceiptText },
    { id: "council", path: "/council", label: "Council", icon: Scale, highlight: true },
    { id: "plan", path: "/plan/budgets", label: "Plan", icon: PieChart },
    { id: "more", path: "/more", label: "More", icon: Menu },
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
        const IconComp = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
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
                ? "var(--accent-purple)"
                : "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px",
              position: "relative",
              transition: "color 0.15s ease",
            }}
          >
            <div
              style={{
                width: item.highlight ? "32px" : "26px",
                height: item.highlight ? "32px" : "26px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: item.highlight ? "50%" : "6px",
                background: isActive
                  ? "var(--accent-primary-glow)"
                  : item.highlight
                  ? "rgba(99, 102, 241, 0.12)"
                  : "transparent",
                transition: "all 0.15s ease",
              }}
            >
              <IconComp size={item.highlight ? 20 : 18} />
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
