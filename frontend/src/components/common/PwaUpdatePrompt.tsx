import React, { useEffect, useState } from "react";
import { Sparkles, RefreshCw, X } from "lucide-react";

export const PwaUpdatePrompt: React.FC = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (!reg) return;

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setNeedRefresh(true);
                setUpdateSW(() => async () => {
                  newWorker.postMessage({ type: "SKIP_WAITING" });
                  window.location.reload();
                });
              }
            });
          }
        });
      });
    }
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "84px",
        left: "16px",
        right: "16px",
        maxWidth: "400px",
        margin: "0 auto",
        zIndex: 9999,
        padding: "14px 16px",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-surface-raised)",
        border: "1px solid var(--accent-primary)",
        boxShadow: "var(--shadow-xl)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-primary)",
            flexShrink: 0,
          }}
        >
          <Sparkles size={18} />
        </div>
        <div>
          <strong style={{ fontSize: "13px", display: "block" }}>Update Available</strong>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            A newer version of MoneyCouncil is ready.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => updateSW && updateSW()}
          className="btn btn-primary"
          style={{ padding: "6px 12px", fontSize: "12px" }}
        >
          <RefreshCw size={13} />
          <span>Reload</span>
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="btn btn-ghost"
          style={{ padding: "6px" }}
          aria-label="Dismiss update"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
