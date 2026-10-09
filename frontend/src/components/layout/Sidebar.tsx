import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ReceiptText,
  PieChart,
  Target,
  CreditCard,
  Scale,
  Sparkles,
  Database,
  Settings as SettingsIcon,
  LogOut,
  Sun,
  Moon,
  Lock,
  ChevronLeft,
  ChevronRight,
  LucideIcon,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useCurrency } from "../../context/CurrencyContext";
import { usePinLock } from "../../context/PinLockContext";
import { useConfirm } from "../../context/ConfirmDialogContext";
import { SyncStatusIndicator } from "../common/SyncStatusIndicator";
import { Badge } from "../common/Badge";

interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  highlight?: boolean;
  badge?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { symbol, currency } = useCurrency();
  const { isPinSet, lockNow } = usePinLock();
  const { confirm } = useConfirm();
  const [collapsed, setCollapsed] = React.useState(false);

  const navGroups: NavGroup[] = [
    {
      title: "Overview",
      items: [
        { id: "dashboard", path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      title: "Money",
      items: [
        { id: "transactions", path: "/transactions", label: "Transactions", icon: ReceiptText },
        { id: "budgets", path: "/plan/budgets", label: "Budgets", icon: PieChart },
        { id: "goals", path: "/plan/goals", label: "Savings Goals", icon: Target },
        { id: "debts", path: "/plan/debts", label: "Debts & Loans", icon: CreditCard },
      ],
    },
    {
      title: "Advice",
      items: [
        {
          id: "council",
          path: "/council",
          label: "Ask the Council",
          icon: Scale,
          highlight: true,
          badge: "AI",
        },
        { id: "review", path: "/review", label: "Smart Review", icon: Sparkles },
      ],
    },
    {
      title: "Account",
      items: [
        { id: "data", path: "/data", label: "Data & Backups", icon: Database },
        { id: "settings", path: "/settings", label: "Settings", icon: SettingsIcon },
      ],
    },
  ];

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: "Sign Out of MoneyCouncil?",
      message: "Are you sure you want to sign out? Any unsaved local changes will be cleared.",
      confirmText: "Sign Out",
      cancelText: "Cancel",
      isDanger: true,
    });
    if (confirmed) {
      await logout();
      navigate("/login");
    }
  };

  const isItemActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/" || location.pathname === "/dashboard";
    if (path.startsWith("/plan/")) return location.pathname === path;
    if (path === "/council") return location.pathname.startsWith("/council");
    if (path === "/review") return location.pathname === "/review" || location.pathname === "/suggestions";
    if (path === "/settings") return location.pathname.startsWith("/settings");
    return location.pathname.startsWith(path);
  };

  return (
    <aside
      className="sidebar glass-panel"
      style={{
        width: collapsed ? "76px" : "var(--sidebar-width)",
        height: "calc(100vh - 32px)",
        maxHeight: "calc(100vh - 32px)",
        margin: "16px 0 16px 16px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: collapsed ? "16px 8px" : "20px 16px",
        transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        overflowY: "auto",
        overflowX: "hidden",
        boxSizing: "border-box",
        flexShrink: 0,
      }}
    >
      <div>
        {/* Logo and Collapse Toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            padding: "4px 8px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              cursor: "pointer",
            }}
            onClick={() => navigate("/dashboard")}
            title="MoneyCouncil"
          >
            <img src="/favicon.svg" alt="MoneyCouncil Logo" style={{ width: "32px", height: "32px", flexShrink: 0 }} />
            {!collapsed && (
              <div>
                <h2
                  style={{
                    fontSize: "16px",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    fontFamily: "var(--font-display)",
                    color: "var(--text-primary)",
                    lineHeight: 1.1,
                  }}
                >
                  MoneyCouncil
                </h2>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--accent-primary)",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  ENSEMBLE AI
                </span>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="btn-icon"
              style={{ width: "28px", height: "28px", minWidth: "28px", minHeight: "28px" }}
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="btn-icon"
              style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px" }}
              title="Expand sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Sync Status Badge */}
        {!collapsed && (
          <div style={{ padding: "0 4px 14px 4px" }}>
            <SyncStatusIndicator />
          </div>
        )}

        {/* Grouped Nav Items */}
        <nav style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {navGroups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "4px 10px 6px 10px",
                  }}
                >
                  {group.title}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                {group.items.map((item) => {
                  const IconComp = item.icon;
                  const active = isItemActive(item.path);

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(item.path)}
                      title={collapsed ? item.label : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: collapsed ? "center" : "space-between",
                        padding: collapsed ? "10px 0" : "9px 12px",
                        borderRadius: "var(--radius-md)",
                        border: active
                          ? "1px solid var(--accent-primary-glow)"
                          : "1px solid transparent",
                        background: active
                          ? "linear-gradient(135deg, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.10) 100%)"
                          : item.highlight && !collapsed
                          ? "rgba(99, 102, 241, 0.05)"
                          : "transparent",
                        color: active
                          ? "var(--accent-primary)"
                          : "var(--text-secondary)",
                        fontWeight: active ? 700 : 500,
                        fontSize: "13.5px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        width: "100%",
                        minHeight: "42px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <IconComp
                          size={18}
                          className={active ? "text-indigo-400" : undefined}
                          style={{
                            color: active
                              ? "var(--accent-primary)"
                              : item.highlight
                              ? "var(--accent-purple)"
                              : "inherit",
                            flexShrink: 0,
                          }}
                        />
                        {!collapsed && <span>{item.label}</span>}
                      </div>

                      {!collapsed && item.badge && (
                        <Badge variant="brand" size="sm">
                          {item.badge}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Footer User Info & Controls */}
      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          paddingTop: "14px",
          marginTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {!collapsed && user && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
            }}
          >
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <div
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {currency || "GHS"} ({symbol})
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              {isPinSet && (
                <button
                  type="button"
                  onClick={lockNow}
                  className="btn-icon"
                  style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px", color: "var(--accent-primary)" }}
                  title="Lock App"
                >
                  <Lock size={15} />
                </button>
              )}

              <button
                type="button"
                onClick={toggleTheme}
                className="btn-icon"
                style={{ width: "32px", height: "32px", minWidth: "32px", minHeight: "32px" }}
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="btn btn-ghost btn-sm"
          style={{
            width: "100%",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: "8px",
            color: "var(--danger)",
          }}
          title="Sign Out"
        >
          <LogOut size={16} />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};
