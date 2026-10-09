import React from "react";
import { Plus, Sun, Moon, Lock } from "lucide-react";
import { useTheme } from "../../context/ThemeContext";
import { usePinLock } from "../../context/PinLockContext";
import { SyncStatusIndicator } from "../common/SyncStatusIndicator";
import { Button } from "../common/Button";

interface NavbarProps {
  currentPageTitle: string;
  onOpenQuickAdd: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPageTitle, onOpenQuickAdd }) => {
  const { theme, toggleTheme } = useTheme();
  const { isPinSet, lockNow } = usePinLock();

  return (
    <>
      {/* Desktop Top Bar */}
      <header
        className="desktop-navbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0 20px 0",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            {currentPageTitle}
          </h2>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenQuickAdd}
            icon={<Plus size={16} />}
            title="Press 'N' anywhere to quick add transaction"
          >
            <span>Quick Add</span>
            <kbd
              style={{
                fontSize: "10px",
                padding: "2px 5px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.25)",
                marginLeft: "4px",
                fontFamily: "inherit",
              }}
            >
              N
            </kbd>
          </Button>
        </div>
      </header>

      {/* Mobile Top Bar */}
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
          <h2
            style={{
              fontSize: "1rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
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
                width: "36px",
                height: "36px",
                minWidth: "36px",
                minHeight: "36px",
                background: "var(--bg-surface-solid)",
                border: "1px solid var(--border-color)",
                color: "var(--accent-primary)",
              }}
              title="Lock App"
              aria-label="Lock App"
            >
              <Lock size={16} />
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="btn-icon"
            style={{
              width: "36px",
              height: "36px",
              minWidth: "36px",
              minHeight: "36px",
              background: "var(--bg-surface-solid)",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
            }}
            title="Toggle Theme"
            aria-label="Toggle Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <style>{`
        @media (max-width: 768px) {
          .desktop-navbar {
            display: none !important;
          }
          .mobile-header {
            display: flex !important;
          }
        }
      `}</style>
    </>
  );
};
