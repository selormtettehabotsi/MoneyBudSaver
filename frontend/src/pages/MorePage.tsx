import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useSync } from "../context/SyncContext";
import { usePinLock } from "../context/PinLockContext";
import { useConfirm } from "../context/ConfirmDialogContext";
import {
  Sparkles,
  Database,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  User as UserIcon,
  Lock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "../components/common/Badge";

interface MorePageProps {
  onNavigate?: (page: string) => void;
}

export const MorePage: React.FC<MorePageProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isOnline, outboxItems } = useSync();
  const { isPinSet, lockNow } = usePinLock();
  const { confirm } = useConfirm();

  const handleItemClick = (path: string, legacyName: string) => {
    navigate(path);
    if (onNavigate) {
      onNavigate(legacyName);
    }
  };

  const handleLogout = async () => {
    const proceed = await confirm({
      title: "Log Out?",
      message: "Are you sure you want to log out of MoneyCouncil? Make sure your offline outbox is synced if you are on a shared device.",
      confirmText: "Log Out",
      cancelText: "Cancel",
      isDanger: true,
    });
    if (proceed) {
      logout();
    }
  };

  const menuItems = [
    {
      id: "suggestions",
      path: "/suggestions",
      legacyName: "suggestions",
      title: "Smart Financial Review",
      description: "0–100 Health Score & automated audit insights",
      icon: Sparkles,
      color: "var(--accent-secondary)",
    },
    {
      id: "data",
      path: "/data",
      legacyName: "data",
      title: "Data & Backups",
      description: "CSV Statement Import/Export & JSON snapshots",
      icon: Database,
      color: "var(--accent-purple)",
    },
    {
      id: "settings",
      path: "/settings",
      legacyName: "settings",
      title: "Settings & AI Models",
      description: "Currencies, guardrails, security & AI voters",
      icon: SettingsIcon,
      color: "var(--accent-primary)",
    },
  ];

  return (
    <div className="flex flex-col gap-5" style={{ width: "100%", maxWidth: "100%" }}>
      {/* User Account Card */}
      <div
        className="glass-panel flex items-center justify-between"
        style={{ padding: "18px 20px" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "18px",
            }}
          >
            {user?.email?.charAt(0).toUpperCase() || <UserIcon size={22} />}
          </div>
          <div className="flex flex-col">
            <span style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
              {user?.email || "Account"}
            </span>
            <div className="flex items-center gap-2 mt-1" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              <Badge variant="info">{user?.currency || "GHS"}</Badge>
              <Badge variant={isOnline ? "success" : "warning"}>
                {isOnline ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        </div>

        {isPinSet && (
          <button
            type="button"
            onClick={lockNow}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            style={{ minHeight: "36px", padding: "6px 12px", fontSize: "12px" }}
          >
            <Lock size={13} />
            <span>Lock</span>
          </button>
        )}
      </div>

      {/* Navigation List */}
      <div className="flex flex-col gap-3">
        {menuItems.map((item) => {
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.path, item.legacyName)}
              className="glass-panel flex items-center justify-between"
              style={{
                padding: "16px 18px",
                textAlign: "left",
                cursor: "pointer",
                border: "1px solid var(--border-color)",
                background: "var(--bg-surface)",
                width: "100%",
                minHeight: "56px",
                borderRadius: "var(--radius-lg)",
                transition: "all 0.15s ease",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "10px",
                    background: "var(--bg-surface-solid)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: item.color,
                  }}
                >
                  <IconComp size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {item.description}
                  </div>
                </div>
              </div>
              <ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
            </button>
          );
        })}

        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          className="glass-panel flex items-center justify-between"
          style={{
            padding: "16px 18px",
            textAlign: "left",
            cursor: "pointer",
            border: "1px solid var(--border-color)",
            background: "var(--bg-surface)",
            width: "100%",
            minHeight: "56px",
            borderRadius: "var(--radius-lg)",
            transition: "all 0.15s ease",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background: "var(--bg-surface-solid)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme === "light" ? "var(--warning)" : "var(--accent-primary)",
              }}
            >
              {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                Theme & Appearance
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {theme === "light" ? "Light Mode (Warm Cream)" : "Dark Mode (Deep Navy)"}
              </div>
            </div>
          </div>
          <span
            className="btn btn-sm btn-secondary"
            style={{ fontSize: "12px", minHeight: "36px" }}
          >
            Switch to {theme === "light" ? "Dark" : "Light"}
          </span>
        </button>

        {/* Sync Diagnostic Info */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--text-secondary)",
          }}
        >
          <div className="flex items-center gap-2">
            {isOnline ? <Wifi size={14} style={{ color: "var(--success)" }} /> : <WifiOff size={14} style={{ color: "var(--warning)" }} />}
            <span>{isOnline ? "Network Connected" : "Operating Offline"}</span>
          </div>
          <span>
            {outboxItems.length > 0 ? `${outboxItems.length} changes queued` : "Cache up to date"}
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="glass-panel flex items-center justify-center gap-2"
          style={{
            padding: "14px 18px",
            cursor: "pointer",
            border: "1px solid var(--danger-border)",
            background: "var(--danger-bg)",
            color: "var(--danger)",
            fontWeight: 600,
            fontSize: "14px",
            width: "100%",
            minHeight: "48px",
            borderRadius: "var(--radius-lg)",
            marginTop: "12px",
            transition: "all 0.15s ease",
          }}
        >
          <LogOut size={17} />
          <span>Log Out of MoneyCouncil</span>
        </button>

        {/* App Version Footer */}
        <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
          MoneyCouncil PWA · Version 1.0.0
        </div>
      </div>
    </div>
  );
};
