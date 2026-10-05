import React from "react";
import {
  LayoutDashboard,
  ReceiptText,
  PieChart,
  Target,
  CreditCard,
  Scale,
  Sparkles,
  Settings as SettingsIcon,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useCurrency } from "../../context/CurrencyContext";

import { usePinLock } from "../../context/PinLockContext";
import { SyncStatusIndicator } from "../common/SyncStatusIndicator";
import { Lock } from "lucide-react";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { currency } = useCurrency();
  const { isPinSet, lockNow } = usePinLock();

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "transactions", label: "Transactions", icon: ReceiptText },
    { id: "budgets", label: "Budgets", icon: PieChart },
    { id: "goals", label: "Savings Goals", icon: Target },
    { id: "debts", label: "Debts & Loans", icon: CreditCard },
    { id: "council", label: "Ask the Council", icon: Scale, highlight: true },
    { id: "suggestions", label: "Smart Review", icon: Sparkles },
    { id: "settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <aside
      className="sidebar glass-panel"
      style={{
        width: "var(--sidebar-width)",
        height: "calc(100vh - 32px)",
        margin: "16px 0 16px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "20px 16px",
        position: "sticky",
        top: "16px",
      }}
    >
      <div>
        {/* Logo */}
        <div
          className="flex items-center justify-between"
          style={{ padding: "8px 12px", marginBottom: "20px" }}
        >
          <div
            className="flex items-center gap-3"
            style={{ cursor: "pointer" }}
            onClick={() => onNavigate("dashboard")}
          >
            <img src="/favicon.svg" alt="MoneyCouncil" style={{ width: "32px", height: "32px" }} />
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.03em" }}>MoneyCouncil</h2>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>AI ADVISOR & BUDGET</span>
            </div>
          </div>
        </div>

        {/* Sync Status Badge */}
        <div style={{ padding: "0 12px 14px 12px" }}>
          <SyncStatusIndicator />
        </div>

        {/* Nav Links */}
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  background: isActive
                    ? item.highlight
                      ? "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.25) 100%)"
                      : "var(--bg-surface-hover)"
                    : "transparent",
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 600 : 500,
                  fontSize: "14px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                  borderLeft: isActive ? "3px solid var(--accent-primary)" : "3px solid transparent",
                }}
              >
                <IconComponent
                  size={18}
                  style={{
                    color: isActive
                      ? "var(--accent-primary)"
                      : item.highlight
                      ? "var(--accent-secondary)"
                      : "var(--text-muted)",
                  }}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* User info & Theme switch */}
      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px" }} className="flex flex-col gap-3">
        <div className="flex items-center justify-between" style={{ padding: "0 8px" }}>
          <div className="flex flex-col">
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user?.email}
            </span>
            <span style={{ fontSize: "11px", color: "var(--accent-secondary)", fontWeight: 600 }}>
              Currency: {currency}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isPinSet && (
              <button
                type="button"
                onClick={lockNow}
                style={{
                  background: "var(--bg-surface-solid)",
                  border: "1px solid var(--border-color)",
                  padding: "6px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--accent-primary)",
                  cursor: "pointer",
                }}
                title="Lock App"
              >
                <Lock size={15} />
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              style={{
                background: "var(--bg-surface-solid)",
                border: "1px solid var(--border-color)",
                padding: "6px",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
              title="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="btn btn-secondary btn-sm"
          style={{ width: "100%", justifyContent: "flex-start", gap: "8px" }}
        >
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
