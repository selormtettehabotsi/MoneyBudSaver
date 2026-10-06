import React, { useState } from "react";
import { IndividualVote } from "../../types/council";
import { useCurrency } from "../../context/CurrencyContext";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Cpu,
  ChevronDown,
  ChevronUp,
  AlertOctagon,
  AlertCircle,
  Timer,
} from "lucide-react";

interface CouncilVoteCardProps {
  vote: IndividualVote;
  defaultExpanded?: boolean;
}

export const CouncilVoteCard: React.FC<CouncilVoteCardProps> = ({
  vote,
  defaultExpanded = true,
}) => {
  const { formatMoney } = useCurrency();
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded);

  const isSuccess = vote.status === "success";
  const verdict = vote.verdict;
  const displayName = vote.display_name || vote.provider_name;

  const verdictBadge = () => {
    if (vote.status === "skipped" || vote.status === "missing_key" || vote.status === "not_configured") {
      return (
        <span className="badge badge-secondary flex items-center gap-1" style={{ opacity: 0.8 }}>
          <Clock size={13} />
          <span>NOT CONFIGURED</span>
        </span>
      );
    }
    if (vote.status === "timeout") {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <Clock size={13} />
          <span>TIMEOUT</span>
        </span>
      );
    }
    if (vote.status === "rate_limited") {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <AlertTriangle size={13} />
          <span>RATE LIMITED</span>
        </span>
      );
    }
    if (vote.status === "invalid_key") {
      return (
        <span className="badge badge-danger flex items-center gap-1">
          <XCircle size={13} />
          <span>INVALID KEY</span>
        </span>
      );
    }
    if (vote.status === "model_not_found") {
      return (
        <span className="badge badge-danger flex items-center gap-1">
          <AlertCircle size={13} />
          <span>MODEL NOT FOUND</span>
        </span>
      );
    }
    if (vote.status === "unavailable") {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <AlertOctagon size={13} />
          <span>UNAVAILABLE</span>
        </span>
      );
    }
    if (!isSuccess) {
      return (
        <span className="badge badge-danger flex items-center gap-1">
          <XCircle size={13} />
          <span>FAILED</span>
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
        padding: "16px 18px",
        borderColor: isSuccess
          ? verdict === "approve"
            ? "var(--success-border)"
            : verdict === "reject"
            ? "var(--danger-border)"
            : "var(--warning-border)"
          : "var(--border-color)",
        background: "var(--bg-surface)",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div>
        {/* Model Header (Collapsible trigger on mobile) */}
        <div
          className="flex items-center justify-between"
          onClick={() => setExpanded(!expanded)}
          style={{ cursor: "pointer", userSelect: "none" }}
        >
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
                flexShrink: 0,
              }}
            >
              <Cpu size={16} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 style={{ fontSize: "14px", fontWeight: 700 }}>{displayName}</h4>
                {vote.is_fallback && vote.model_used && (
                  <span
                    className="badge badge-secondary"
                    style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      background: "rgba(234, 179, 8, 0.15)",
                      color: "var(--warning)",
                      borderColor: "rgba(234, 179, 8, 0.3)",
                    }}
                  >
                    Fallback: {vote.model_used}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                <span>{vote.model_family}</span>
                {vote.model_used && !vote.is_fallback && (
                  <span style={{ opacity: 0.7 }}>({vote.model_used})</span>
                )}
                {vote.latency_ms !== null && vote.latency_ms !== undefined && vote.latency_ms > 0 && (
                  <span className="flex items-center gap-0.5" style={{ color: "var(--text-secondary)" }}>
                    • <Timer size={11} /> {vote.latency_ms >= 1000 ? `${(vote.latency_ms / 1000).toFixed(1)}s` : `${vote.latency_ms}ms`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {verdictBadge()}
            <button
              type="button"
              aria-label="Toggle details"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: "4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Confidence Meter (Always visible) */}
        {isSuccess && vote.confidence !== null && (
          <div style={{ margin: "10px 0" }}>
            <div className="flex items-center justify-between" style={{ fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "var(--text-secondary)" }}>Confidence</span>
              <strong style={{ color: "var(--text-primary)" }}>{vote.confidence}%</strong>
            </div>
            <div className="progress-bar-bg" style={{ height: "5px" }}>
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

        {/* Expandable Reasoning & Details */}
        {expanded && (
          <div style={{ marginTop: "10px", animation: "fadeIn 0.15s ease-out" }}>
            {/* Reasoning */}
            <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5 }}>
              {vote.reasoning || vote.error_message || "No explanation provided."}
            </p>

            {/* Suggested Amount */}
            {vote.suggested_amount && (
              <div
                style={{
                  marginTop: "10px",
                  padding: "6px 10px",
                  background: "var(--bg-surface-solid)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "12px",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>Suggested Limit: </span>
                <strong style={{ color: "var(--accent-secondary)" }}>{formatMoney(vote.suggested_amount)}</strong>
              </div>
            )}

            {/* Key Risks */}
            {vote.risks && vote.risks.length > 0 && (
              <div style={{ marginTop: "10px" }}>
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
              <div style={{ marginTop: "10px" }}>
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
        )}
      </div>
    </div>
  );
};
