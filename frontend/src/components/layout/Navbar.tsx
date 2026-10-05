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
        padding: "calc(10px + env(safe-area-inset-top, 0px)) 16px 10px 16px",
        margin: "0 0 16px 0",
        position: "sticky",
        top: 0,
        zIndex: 400,
        borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
      }}
    >
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <img src="/favicon.svg" alt="Logo" style={{ width: "26px", height: "26px", flexShrink: 0 }} />
        <h2 style={{ fontSize: "1.05rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentPageTitle}
        </h2>
      </div>

      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <SyncStatusIndicator />

        {isPinSet && (
          <button
            type="button"
            onClick={lockNow}
            className="btn-icon"
            style={{
              background: "var(--bg-surface-solid)",
              border: "1px solid var(--border-color)",
              color: "var(--accent-primary)",
            }}
            title="Lock App"
            aria-label="Lock App"
          >
            <Lock size={18} />
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="btn-icon"
          style={{
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            color: "var(--text-secondary)",
          }}
          title="Toggle Theme"
          aria-label="Toggle Theme"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          type="button"
          onClick={logout}
          className="btn-icon"
          style={{
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            color: "var(--danger)",
          }}
          title="Sign Out"
          aria-label="Sign Out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
