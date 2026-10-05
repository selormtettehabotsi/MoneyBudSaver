import React from "react";
import { CouncilTally } from "../../types/council";
import { CheckCircle2, XCircle, Scale, ThumbsUp, ThumbsDown, Edit3 } from "lucide-react";

interface CouncilTallyPanelProps {
  tally: CouncilTally;
  guardrailViolations?: string[];
  userVerdict?: "accepted" | "rejected" | "modified" | null;
  userModifications?: string | null;
  onUserDecision: (verdict: "accepted" | "rejected" | "modified") => void;
}

export const CouncilTallyPanel: React.FC<CouncilTallyPanelProps> = ({
  tally,
  guardrailViolations,
  userVerdict,
  userModifications,
  onUserDecision,
}) => {
  const isApprove = tally.final_verdict === "approve" || tally.final_verdict === "approve_with_conditions";
  const isReject = tally.final_verdict === "reject";

  // Normalized score for meter: -1.0 to +1.0 mapped to 0% to 100%
  const scorePercent = ((tally.weighted_score + 1.0) / 2.0) * 100;

  const hasGuardrailBreach = guardrailViolations && guardrailViolations.length > 0;

  return (
    <div
      className="glass-panel"
      style={{
        padding: "24px",
        borderColor: hasGuardrailBreach
          ? "var(--danger-border)"
          : isApprove
          ? "var(--success-border)"
          : isReject
          ? "var(--danger-border)"
          : "var(--warning-border)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Top Verdict Status */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
        <div className="flex items-center gap-3">
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: isApprove ? "var(--success-bg)" : isReject ? "var(--danger-bg)" : "var(--warning-bg)",
              color: isApprove ? "var(--success)" : isReject ? "var(--danger)" : "var(--warning)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isApprove ? <CheckCircle2 size={22} /> : isReject ? <XCircle size={22} /> : <Scale size={22} />}
          </div>

          <div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>
              Council Consensus
            </span>
            <h2 style={{ fontSize: "20px" }}>
              {tally.final_verdict === "approve"
                ? "Council Recommendation: APPROVE"
                : tally.final_verdict === "approve_with_conditions"
                ? "Council Recommendation: CONDITIONAL APPROVAL"
                : tally.final_verdict === "reject"
                ? "Council Recommendation: REJECT"
                : "Council Recommendation: SPLIT TIE (NO CONSENSUS)"}
            </h2>
          </div>
        </div>

        {/* Score Badge */}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Weighted Score:</span>
          <span
            className={`badge ${isApprove ? "badge-success" : isReject ? "badge-danger" : "badge-warning"}`}
            style={{ fontSize: "14px", padding: "4px 10px" }}
          >
            {tally.weighted_score > 0 ? "+" : ""}
            {tally.weighted_score.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Consensus Score Slider Track */}
      <div style={{ margin: "16px 0 20px 0" }}>
        <div className="flex items-center justify-between" style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
          <span>Reject (-1.0)</span>
          <span>Neutral (0.0)</span>
          <span>Approve (+1.0)</span>
        </div>
        <div className="progress-bar-bg" style={{ height: "8px", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              top: "-3px",
              left: `calc(${Math.max(2, Math.min(98, scorePercent))}% - 7px)`,
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              background: "#ffffff",
              border: `2px solid ${isApprove ? "var(--success)" : isReject ? "var(--danger)" : "var(--warning)"}`,
              boxShadow: "0 0 8px rgba(255,255,255,0.4)",
            }}
          />
          <div
            className="progress-bar-fill"
            style={{
              width: `${scorePercent}%`,
              background: "linear-gradient(90deg, var(--danger) 0%, var(--warning) 50%, var(--success) 100%)",
            }}
          />
        </div>
      </div>

      {/* Plain Language Consensus Summary */}
      <p style={{ fontSize: "14px", color: "var(--text-primary)", lineHeight: 1.6, marginBottom: "16px" }}>
        {tally.consensus_summary}
      </p>

      {/* Hard Guardrail Alert if Breached */}
      {hasGuardrailBreach && (
        <div
          className="badge-danger flex flex-col gap-1"
          style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}
        >
          <strong>HARD GUARDRAIL WARNING:</strong>
          {guardrailViolations.map((v, i) => (
            <span key={i} style={{ fontSize: "12px" }}>• {v}</span>
          ))}
        </div>
      )}

      {/* Key Agreements and Dissent */}
      <div className="grid grid-cols-2 gap-4" style={{ marginBottom: "24px" }}>
        {tally.key_agreements && tally.key_agreements.length > 0 && (
          <div style={{ background: "var(--bg-surface)", padding: "14px", borderRadius: "var(--radius-md)" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--success)" }}>KEY AGREEMENTS</span>
            <ul style={{ paddingLeft: "16px", marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
              {tally.key_agreements.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {tally.key_disagreements && tally.key_disagreements.length > 0 && (
          <div style={{ background: "var(--bg-surface)", padding: "14px", borderRadius: "var(--radius-md)" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--danger)" }}>DISSENT & CONCERNS</span>
            <ul style={{ paddingLeft: "16px", marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
              {tally.key_disagreements.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* User's Final Decision Actions */}
      <div
        style={{
          borderTop: "1px solid var(--border-color)",
          paddingTop: "18px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "8px" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            Your Final Decision (You have the final say):
          </span>

          {userVerdict ? (
            <span className={`badge ${userVerdict === "accepted" ? "badge-success" : userVerdict === "rejected" ? "badge-danger" : "badge-info"}`}>
              DECISION RECORDED: {userVerdict.toUpperCase()}
            </span>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Decision Pending</span>
          )}
        </div>

        {userModifications && (
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" }}>
            Note: "{userModifications}"
          </p>
        )}

        <div className="flex items-center gap-3" style={{ marginTop: "6px" }}>
          <button
            className={`btn ${userVerdict === "accepted" ? "btn-success" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => onUserDecision("accepted")}
          >
            <ThumbsUp size={16} />
            <span>Accept Council Verdict</span>
          </button>

          <button
            className={`btn ${userVerdict === "rejected" ? "btn-danger" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => onUserDecision("rejected")}
          >
            <ThumbsDown size={16} />
            <span>Reject / Overrule</span>
          </button>

          <button
            className={`btn ${userVerdict === "modified" ? "btn-primary" : "btn-secondary"}`}
            style={{ flex: 1 }}
            onClick={() => onUserDecision("modified")}
          >
            <Edit3 size={16} />
            <span>Modify Terms</span>
          </button>
        </div>
      </div>
    </div>
  );
};
