import React from "react";
import { AlertCircle, CheckCircle2, ShieldAlert, Scale, ArrowRight } from "lucide-react";
import { Button } from "../common/Button";

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
        padding: "22px 24px",
        borderColor: hasBreaches ? "var(--danger-border)" : "var(--success-border)",
        background: hasBreaches ? "var(--danger-bg)" : "var(--success-bg)",
        transition: "all 0.2s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: hasBreaches ? "var(--danger)" : "var(--success)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {hasBreaches ? <ShieldAlert size={22} /> : <CheckCircle2 size={22} />}
          </div>
          <div>
            <h3
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "4px",
              }}
            >
              {hasBreaches ? "Financial Guardrail Warning" : "Financial Health Guardrails Clear"}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                maxWidth: "680px",
              }}
            >
              {hasBreaches
                ? "Your financial health metrics have triggered defensive warnings. Consult the AI Council before taking additional loans or major expenses."
                : "All Debt-to-Income and emergency runway metrics are within healthy thresholds. Continue following your budget and savings plan."}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant={hasBreaches ? "danger" : "secondary"}
          size="sm"
          onClick={onAskCouncil}
          icon={<Scale size={15} />}
          iconRight={<ArrowRight size={14} />}
        >
          Ask Council
        </Button>
      </div>

      {hasBreaches && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
          {guardrailWarnings.map((w, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "var(--bg-surface)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                color: "var(--danger)",
                fontWeight: 600,
                border: "1px solid var(--danger-border)",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
