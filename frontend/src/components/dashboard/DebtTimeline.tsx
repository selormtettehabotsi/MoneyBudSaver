import React from "react";
import { AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";

interface DebtTimelineProps {
  guardrailWarnings: string[];
  onAskCouncil: () => void;
}

export const DebtTimeline: React.FC<DebtTimelineProps> = ({ guardrailWarnings, onAskCouncil }) => {
  const hasBreaches = guardrailWarnings && guardrailWarnings.length > 0;

  return (
    <div
      className="glass-panel"
      style={{
        padding: "20px 24px",
        borderColor: hasBreaches ? "var(--danger-border)" : "var(--border-color)",
        background: hasBreaches ? "rgba(244, 63, 94, 0.04)" : "var(--bg-surface)",
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: "16px" }}>
        <div className="flex items-center gap-2">
          {hasBreaches ? (
            <ShieldAlert size={20} style={{ color: "var(--danger)" }} />
          ) : (
            <CheckCircle2 size={20} style={{ color: "var(--success)" }} />
          )}
          <div>
            <h3 style={{ fontSize: "16px", color: hasBreaches ? "var(--danger)" : "var(--text-primary)" }}>
              {hasBreaches ? "Hard Guardrail Alert" : "Financial Health Guardrails"}
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {hasBreaches ? "Action required before taking new financial commitments" : "All safety metrics within normal limits"}
            </span>
          </div>
        </div>

        <button className="btn btn-primary btn-sm" onClick={onAskCouncil}>
          Ask Council
        </button>
      </div>

      {hasBreaches ? (
        <div className="flex flex-col gap-2" style={{ marginTop: "12px" }}>
          {guardrailWarnings.map((w, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2"
              style={{
                background: "var(--danger-bg)",
                padding: "8px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                color: "var(--danger)",
                fontWeight: 500,
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Your current DTI ratio and runway are within safe thresholds. If you are planning a significant purchase, new debt, or major budget reallocation, convene the multi-AI Council for advice.
        </p>
      )}
    </div>
  );
};
