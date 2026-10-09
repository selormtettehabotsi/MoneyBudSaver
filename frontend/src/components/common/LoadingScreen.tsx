import React, { useState, useEffect } from "react";
import { ShieldCheck, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";

export interface LoadingScreenProps {
  message?: string;
  onTimeoutSkip?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = "Securing MoneyCouncil Session...",
  onTimeoutSkip,
}) => {
  const [progress, setProgress] = useState(0);
  const [showColdStartHint, setShowColdStartHint] = useState(false);
  const [showSkipButton, setShowSkipButton] = useState(false);

  useEffect(() => {
    // Smooth progress simulation from 0 to 95%
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 96) return prev;
        // Fast at first (0-60%), then decelerates toward 95%
        const remaining = 96 - prev;
        const delta = Math.max(1, Math.floor(remaining * 0.12));
        return Math.min(96, prev + delta);
      });
    }, 120);

    // After 6 seconds, show cold-start explanation if still loading
    const hintTimer = setTimeout(() => {
      setShowColdStartHint(true);
    }, 6000);

    // After 10 seconds, offer a button to continue directly to login
    const skipTimer = setTimeout(() => {
      setShowSkipButton(true);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(hintTimer);
      clearTimeout(skipTimer);
    };
  }, []);

  const getStatusText = (pct: number) => {
    if (pct < 25) return "Initializing cryptographic environment...";
    if (pct < 55) return message;
    if (pct < 80) return "Loading encrypted local storage...";
    if (pct < 98) return "Synchronizing financial ledger...";
    return "Ready!";
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        padding: "24px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background ambient gradient glow */}
      <div
        style={{
          position: "absolute",
          width: "360px",
          height: "360px",
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--accent-primary-glow) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
          opacity: 0.6,
          animation: "pulseSubtle 3s ease-in-out infinite",
        }}
      />

      {/* Main Container */}
      <div
        className="glass-panel"
        style={{
          maxWidth: "400px",
          width: "100%",
          padding: "36px 28px",
          borderRadius: "var(--radius-xl)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "20px",
          boxShadow: "var(--shadow-lg)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Animated Brand Logo & Concentric Spinner */}
        <div
          style={{
            position: "relative",
            width: "72px",
            height: "72px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Outer Rotating Ring */}
          <div
            className="animate-spin"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "3px solid transparent",
              borderTopColor: "var(--accent-primary)",
              borderRightColor: "var(--accent-primary)",
            }}
          />

          {/* Inner Counter-Rotating Ring */}
          <div
            className="animate-spin-reverse"
            style={{
              position: "absolute",
              inset: "8px",
              borderRadius: "50%",
              border: "2px solid transparent",
              borderBottomColor: "var(--accent-purple)",
              borderLeftColor: "var(--accent-purple)",
            }}
          />

          {/* Center Brand Icon */}
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "50%",
              background: "var(--bg-surface-solid)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-primary)",
              boxShadow: "0 0 12px var(--accent-primary-glow)",
            }}
          >
            <ShieldCheck size={24} />
          </div>
        </div>

        {/* Brand Title & Dynamic Subtitle */}
        <div>
          <h2
            style={{
              fontSize: "19px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: "6px",
            }}
          >
            MoneyCouncil
          </h2>
          <div
            style={{
              fontSize: "13px",
              color: "var(--text-secondary)",
              minHeight: "20px",
              transition: "all 0.2s ease",
            }}
          >
            {getStatusText(progress)}
          </div>
        </div>

        {/* 0 to 100 Progress Bar & Metric */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            style={{
              width: "100%",
              height: "8px",
              background: "var(--bg-input)",
              borderRadius: "999px",
              overflow: "hidden",
              border: "1px solid var(--border-color)",
            }}
          >
            <div
              className="progress-striped"
              style={{
                height: "100%",
                width: `${progress}%`,
                borderRadius: "999px",
                background: "linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
                boxShadow: "0 0 12px var(--accent-primary-glow)",
                transition: "width 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              color: "var(--text-muted)",
              padding: "0 2px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <RefreshCw size={11} className="animate-spin" />
              <span>Connecting</span>
            </span>
            <span
              className="tabular-nums"
              style={{
                fontWeight: 700,
                fontSize: "13px",
                color: "var(--accent-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {progress}%
            </span>
          </div>
        </div>

        {/* Render Cold Start Hint if taking longer */}
        {showColdStartHint && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--warning-bg)",
              border: "1px solid var(--warning-border)",
              fontSize: "12px",
              color: "var(--warning)",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              textAlign: "left",
              lineHeight: 1.4,
              animation: "fadeIn 0.3s ease-out",
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Cloud server waking up</strong>
              <div style={{ marginTop: "2px", opacity: 0.9 }}>
                Cloud hosts spin down when idle. Standby boot typically finishes in 20–30 seconds.
              </div>
            </div>
          </div>
        )}

        {/* Skip to Login button if user doesn't want to wait */}
        {showSkipButton && onTimeoutSkip && (
          <button
            type="button"
            onClick={onTimeoutSkip}
            className="btn btn-secondary btn-sm flex items-center justify-center gap-2"
            style={{
              width: "100%",
              marginTop: "4px",
              animation: "fadeIn 0.3s ease-out",
            }}
          >
            <span>Proceed to Login / Offline Mode</span>
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Footer Branding */}
      <div
        style={{
          marginTop: "18px",
          fontSize: "11px",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>Protected by Web Crypto PBKDF2</span>
        <span>·</span>
        <span>MoneyCouncil PWA v1.0.0</span>
      </div>
    </div>
  );
};
