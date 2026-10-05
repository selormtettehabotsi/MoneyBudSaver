import React from "react";
import { IndividualVote } from "../../types/council";
import { useCurrency } from "../../context/CurrencyContext";
import { CheckCircle2, AlertTriangle, XCircle, Clock, Cpu } from "lucide-react";

interface CouncilVoteCardProps {
  vote: IndividualVote;
}

export const CouncilVoteCard: React.FC<CouncilVoteCardProps> = ({ vote }) => {
  const { formatMoney } = useCurrency();

  const isSuccess = vote.status === "success";
  const verdict = vote.verdict;

  const verdictBadge = () => {
    if (!isSuccess) {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <Clock size={13} />
          <span>{vote.status.toUpperCase()}</span>
        </span>
      );
    }
    if (verdict === "approve") {
      return (
        <span className="badge badge-success flex items-center gap-1">
          <CheckCircle2 size={13} />
          <span>APPROVE</span>
        </span>
      );
    }
    if (verdict === "approve_with_conditions") {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <AlertTriangle size={13} />
          <span>CONDITIONAL</span>
        </span>
      );
    }
    return (
      <span className="badge badge-danger flex items-center gap-1">
        <XCircle size={13} />
        <span>REJECT</span>
      </span>
    );
  };

  return (
    <div
      className="glass-panel flex flex-col justify-between"
      style={{
        padding: "20px",
        borderColor: isSuccess
          ? verdict === "approve"
            ? "var(--success-border)"
            : verdict === "reject"
            ? "var(--danger-border)"
            : "var(--warning-border)"
          : "var(--border-color)",
        background: "var(--bg-surface)",
      }}
    >
      <div>
        {/* Model Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: "14px" }}>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(99, 102, 241, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-primary)",
              }}
            >
              <Cpu size={16} />
            </div>
            <div>
              <h4 style={{ fontSize: "15px", fontWeight: 700 }}>{vote.provider_name}</h4>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{vote.model_family}</span>
            </div>
          </div>

          {verdictBadge()}
        </div>

        {/* Confidence Meter */}
        {isSuccess && vote.confidence !== null && (
          <div style={{ margin: "12px 0" }}>
            <div className="flex items-center justify-between" style={{ fontSize: "12px", marginBottom: "4px" }}>
              <span style={{ color: "var(--text-secondary)" }}>Confidence Level</span>
              <strong style={{ color: "var(--text-primary)" }}>{vote.confidence}%</strong>
            </div>
            <div className="progress-bar-bg" style={{ height: "6px" }}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${vote.confidence}%`,
                  background:
                    vote.confidence >= 75
                      ? "var(--success)"
                      : vote.confidence >= 50
                      ? "var(--warning)"
                      : "var(--danger)",
                }}
              />
            </div>
          </div>
        )}

        {/* Reasoning */}
        <div style={{ marginTop: "12px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5 }}>
            {vote.reasoning || vote.error_message || "No explanation provided."}
          </p>
        </div>

        {/* Suggested Amount */}
        {vote.suggested_amount && (
          <div
            style={{
              marginTop: "12px",
              padding: "8px 12px",
              background: "var(--bg-surface-solid)",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Suggested Ceiling: </span>
            <strong style={{ color: "var(--accent-secondary)" }}>{formatMoney(vote.suggested_amount)}</strong>
          </div>
        )}

        {/* Key Risks */}
        {vote.risks && vote.risks.length > 0 && (
          <div style={{ marginTop: "14px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--danger)", textTransform: "uppercase" }}>
              Identified Risks:
            </span>
            <ul style={{ paddingLeft: "16px", marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
              {vote.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Required Conditions */}
        {vote.conditions && vote.conditions.length > 0 && (
          <div style={{ marginTop: "12px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--warning)", textTransform: "uppercase" }}>
              Required Conditions:
            </span>
            <ul style={{ paddingLeft: "16px", marginTop: "4px", fontSize: "12px", color: "var(--text-secondary)" }}>
              {vote.conditions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
