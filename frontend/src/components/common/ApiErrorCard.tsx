import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ApiErrorCardProps {
  title?: string;
  message?: string;
  requestId?: string | null;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const ApiErrorCard: React.FC<ApiErrorCardProps> = ({
  title = "Something went wrong",
  message = "We couldn't load your financial data right now. Please try again.",
  requestId,
  onRetry,
  isRetrying = false,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: "32px 24px",
        textAlign: "center",
        borderRadius: "var(--radius-lg)",
        background: "rgba(239, 68, 68, 0.04)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        maxWidth: "480px",
        margin: "24px auto",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: "var(--danger-bg)",
          color: "var(--danger)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px auto",
        }}
      >
        <AlertTriangle size={24} />
      </div>

      <h3 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: "8px", color: "var(--text-primary)" }}>
        {title}
      </h3>

      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.5 }}>
        {message}
      </p>

      {requestId && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            fontFamily: "monospace",
            marginBottom: "20px",
            background: "var(--bg-surface)",
            padding: "4px 8px",
            borderRadius: "4px",
            display: "inline-block",
          }}
        >
          Reference ID: {requestId}
        </div>
      )}

      {onRetry && (
        <div>
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="btn btn-primary"
            style={{
              minHeight: "44px",
              minWidth: "140px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <RefreshCw size={16} className={isRetrying ? "spin" : ""} style={{ animation: isRetrying ? "spin 1s linear infinite" : "none" }} />
            <span>{isRetrying ? "Retrying..." : "Try Again"}</span>
          </button>
        </div>
      )}
    </div>
  );
};
