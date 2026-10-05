import React from "react";
import { Sun, Moon, LogOut, Lock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { usePinLock } from "../../context/PinLockContext";
import { SyncStatusIndicator } from "../common/SyncStatusIndicator";

interface NavbarProps {
  currentPageTitle: string;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPageTitle }) => {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { isPinSet, lockNow } = usePinLock();

  return (
    <header
      className="mobile-header glass-panel"
      style={{
        display: "none",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        margin: "12px 12px 0 12px",
      }}
    >
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" alt="Logo" style={{ width: "24px", height: "24px" }} />
        <h2 style={{ fontSize: "16px" }}>{currentPageTitle}</h2>
      </div>

      <div className="flex items-center gap-2">
        <SyncStatusIndicator />

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
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <button
          type="button"
          onClick={logout}
          style={{
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            padding: "6px",
            borderRadius: "var(--radius-sm)",
            color: "var(--danger)",
            cursor: "pointer",
          }}
          title="Sign Out"
        >
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
};
