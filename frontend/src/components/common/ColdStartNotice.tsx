import React from "react";
import { useServerStatus } from "../../context/ServerStatusContext";
import { Loader2 } from "lucide-react";

export const ColdStartNotice: React.FC = () => {
  const { isWarming, retryCount } = useServerStatus();

  if (!isWarming) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        background: "rgba(15, 23, 42, 0.92)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(99, 102, 241, 0.5)",
        borderRadius: "999px",
        padding: "8px 20px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        color: "#f8fafc",
        fontSize: "13px",
        fontWeight: 500,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <Loader2 size={16} className="animate-spin text-indigo-400" style={{ animation: "spin 1s linear infinite" }} />
      <span>Waking up MoneyCouncil backend server... {retryCount > 1 ? `(Attempt ${retryCount})` : ""}</span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
