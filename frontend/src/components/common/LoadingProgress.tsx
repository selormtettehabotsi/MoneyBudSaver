import React, { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";

export interface LoadingProgressProps {
  /** Target percentage (0-100). If omitted, an auto-simulated progress is displayed */
  progress?: number;
  /** Primary status message */
  message?: string;
  /** Optional subtitle or step description */
  submessage?: string;
  subMessage?: string;
  /** Height of the progress bar in pixels (default: 8) */
  barHeight?: number;
  /** Whether to show percentage number (default: true) */
  showPercentage?: boolean;
  /** Compact inline mode */
  compact?: boolean;
  /** Custom icon */
  icon?: React.ReactNode;
}

export const LoadingProgress: React.FC<LoadingProgressProps> = ({
  progress: externalProgress,
  message = "Loading data...",
  submessage,
  subMessage,
  barHeight = 8,
  showPercentage = true,
  compact = false,
  icon,
}) => {
  const activeSubmessage = submessage || subMessage;
  const [internalProgress, setInternalProgress] = useState(externalProgress !== undefined ? externalProgress : 0);

  // If no external progress is provided, simulate a realistic smooth progress up to 92%
  useEffect(() => {
    if (externalProgress !== undefined) {
      setInternalProgress(externalProgress);
      return;
    }

    const interval = setInterval(() => {
      setInternalProgress((prev) => {
        if (prev >= 95) return prev;
        // Step faster at first, then slow down near 90%
        const delta = Math.max(1, Math.floor((95 - prev) * 0.15));
        return Math.min(95, prev + delta);
      });
    }, 180);

    return () => clearInterval(interval);
  }, [externalProgress]);

  const currentPercent = Math.min(100, Math.max(0, externalProgress !== undefined ? externalProgress : internalProgress));
  const isComplete = currentPercent >= 100;

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)" }}>
            {icon || <RefreshCw size={13} className="animate-spin text-indigo-400" />}
            <span>{message}</span>
          </div>
          {showPercentage && (
            <span
              className="tabular-nums"
              style={{ fontWeight: 700, color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}
            >
              {Math.round(currentPercent)}%
            </span>
          )}
        </div>
        <div className="progress-bar-bg" style={{ height: `${barHeight}px` }}>
          <div
            className="progress-bar-fill progress-striped"
            style={{
              width: `${currentPercent}%`,
              background: isComplete
                ? "var(--success)"
                : "linear-gradient(90deg, var(--accent-primary), var(--accent-purple))",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        padding: "24px 16px",
        width: "100%",
        maxWidth: "420px",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      {/* Spinning Dual Ring */}
      <div style={{ position: "relative", width: "52px", height: "52px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          className="animate-spin"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "3px solid transparent",
            borderTopColor: "var(--accent-primary)",
            borderRightColor: "var(--accent-primary)",
            opacity: 0.9,
          }}
        />
        <div
          className="animate-spin-reverse"
          style={{
            position: "absolute",
            inset: "5px",
            borderRadius: "50%",
            border: "2px solid transparent",
            borderBottomColor: "var(--accent-purple)",
            borderLeftColor: "var(--accent-purple)",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            color: isComplete ? "var(--success)" : "var(--accent-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isComplete ? <CheckCircle2 size={22} /> : icon || <RefreshCw size={18} />}
        </div>
      </div>

      {/* Message and Submessage */}
      <div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
          {message}
        </div>
        {activeSubmessage && (
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
            {activeSubmessage}
          </div>
        )}
      </div>

      {/* Progress Track and Percent Number */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div className="progress-bar-bg" style={{ height: `${barHeight}px` }}>
          <div
            className="progress-bar-fill progress-striped"
            style={{
              width: `${currentPercent}%`,
              background: isComplete
                ? "var(--success)"
                : "linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
              boxShadow: "0 0 10px var(--accent-primary-glow)",
            }}
          />
        </div>

        {showPercentage && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "11px",
              color: "var(--text-muted)",
            }}
          >
            <span>{isComplete ? "Completed" : "Processing"}</span>
            <span
              className="tabular-nums"
              style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
            >
              {Math.round(currentPercent)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
