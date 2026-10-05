import React from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  Sparkles,
  Database,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
  Shield,
  User as UserIcon,
} from "lucide-react";

interface MorePageProps {
  onNavigate: (page: string) => void;
}

export const MorePage: React.FC<MorePageProps> = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const menuItems = [
    {
      id: "suggestions",
      title: "Smart Financial Review",
      description: "0–100 Health Score & automated audit insights",
      icon: Sparkles,
      color: "var(--accent-secondary)",
      action: () => onNavigate("suggestions"),
    },
    {
      id: "data",
      title: "Data & Backups",
      description: "CSV Statement Import/Export & JSON snapshots",
      icon: Database,
      color: "var(--accent-purple)",
      action: () => onNavigate("data"),
    },
    {
      id: "settings",
      title: "Settings & AI Models",
      description: "Currencies, guardrail thresholds & provider keys",
      icon: SettingsIcon,
      color: "var(--accent-primary)",
      action: () => onNavigate("settings"),
    },
  ];

  return (
    <div className="flex flex-col gap-5" style={{ width: "100%", maxWidth: "100%" }}>
      {/* User Card */}
      <div
        className="glass-panel flex items-center justify-between"
        style={{ padding: "18px 20px" }}
      >
        <div className="flex items-center gap-3">
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <UserIcon size={22} />
          </div>
          <div className="flex flex-col">
            <span style={{ fontWeight: 700, fontSize: "16px" }}>{user?.email || "Account"}</span>
            <div className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              <Shield size={13} style={{ color: "var(--success)" }} />
              <span>Currency: {user?.currency || "GHS"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex flex-col gap-3">
        {menuItems.map((item) => {
          const IconComp = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.action}
              className="glass-panel flex items-center justify-between"
              style={{
                padding: "16px 18px",
                textAlign: "left",
                cursor: "pointer",
                border: "1px solid var(--border-color)",
                background: "var(--bg-surface)",
                width: "100%",
                minHeight: "56px",
                transition: "all 0.15s ease",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: "36px",
                    height: "36px",
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

        {/* Theme Switcher Card */}
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
            transition: "all 0.15s ease",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: "36px",
                height: "36px",
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
                Appearance
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Currently in {theme === "light" ? "Warm Cream (Eye-friendly)" : "Dark Obsidian"}
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

        {/* Logout Button */}
        <button
          onClick={logout}
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
          }}
        >
          <LogOut size={17} />
          <span>Log Out of MoneyCouncil</span>
        </button>
      </div>
    </div>
  );
};
