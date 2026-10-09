import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { suggestionsApi, WeeklyReviewResult, SuggestionLogOut } from "../api/suggestions";
import { ApiErrorCard } from "../components/common/ApiErrorCard";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { EmptyState } from "../components/common/EmptyState";
import { SegmentedControl } from "../components/common/SegmentedControl";
import { LoadingProgress } from "../components/common/LoadingProgress";
import { useSync } from "../context/SyncContext";
import { useToast } from "../context/ToastContext";
import {
  formatRunway,
  formatSavingsRate,
  formatDTI,
} from "../utils/formatters";
import {
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Shield,
  TrendingUp,
  CreditCard,
  PieChart,
  Scale,
  History,
} from "lucide-react";

interface SuggestionsPageProps {
  onNavigateToCouncil?: (prefillQuery?: string) => void;
}

export const SuggestionsPage: React.FC<SuggestionsPageProps> = ({ onNavigateToCouncil }) => {
  const navigate = useNavigate();
  const { loadCachedOrFetch, isOnline } = useSync();
  const { success: toastSuccess, error: toastError } = useToast();

  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SuggestionLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      setErrorRequestId(null);
      const [reviewRes, historyRes] = await Promise.all([
        loadCachedOrFetch("weekly_review", () => suggestionsApi.getWeeklyReview(), (c) => { if (c) setReview(c); }),
        loadCachedOrFetch("suggestions_history", () => suggestionsApi.getHistory(), (c) => { if (c) setHistoryLogs(c); }),
      ]);
      if (reviewRes) setReview(reviewRes);
      if (historyRes) setHistoryLogs(historyRes);
    } catch (err: any) {
      if (!review) {
        setError(err.message || "Failed to load smart insights.");
        setErrorRequestId(err.requestId || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerate = async () => {
    try {
      setRefreshing(true);
      const freshReview = await suggestionsApi.generateWeeklyReview();
      setReview(freshReview);
      const historyRes = await suggestionsApi.getHistory();
      setHistoryLogs(historyRes);
      toastSuccess("Fresh weekly audit completed.");
    } catch (err: any) {
      toastError(err.message || "Failed to run audit.");
    } finally {
      setRefreshing(false);
    }
  };

  const hasSufficient = review?.metrics_summary?.has_sufficient_data !== false;
  const score = review?.health_score ?? 50;

  const getScoreColor = (sc: number) => {
    if (!hasSufficient) return "var(--accent-primary)";
    if (sc >= 85) return "var(--success)";
    if (sc >= 70) return "#10b981";
    if (sc >= 50) return "var(--warning)";
    return "var(--danger)";
  };

  const getScoreGrade = (sc: number) => {
    if (!hasSufficient) return "Provisional — Accumulating Baseline Data";
    if (sc >= 85) return "Excellent Financial Resilience";
    if (sc >= 70) return "Healthy & Stable Position";
    if (sc >= 50) return "Moderate – Action Advised";
    return "Vulnerable – Critical Adjustments Required";
  };

  const handleAskCouncilForFinding = (title: string) => {
    const question = `Regarding my financial audit finding: "${title}". What steps should I take?`;
    if (onNavigateToCouncil) {
      onNavigateToCouncil(question);
    } else {
      navigate("/council", { state: { initialQuestion: question } });
    }
  };

  const filteredSuggestions = review?.suggestions.filter((item) => {
    if (filterSeverity === "all") return true;
    return item.severity === filterSeverity;
  }) || [];

  const countBySeverity = {
    all: review?.suggestions.length || 0,
    critical: review?.suggestions.filter((s) => s.severity === "critical").length || 0,
    warning: review?.suggestions.filter((s) => s.severity === "warning").length || 0,
    info: review?.suggestions.filter((s) => s.severity === "info").length || 0,
  };

  if (loading && !review) {
    return (
      <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingProgress
          message="Evaluating financial health indicators..."
          submessage="Auditing spending trends, debt ratios, and emergency runway"
        />
      </div>
    );
  }

  if (error || !review) {
    return (
      <ApiErrorCard
        title="Smart Insights Unavailable"
        message={error || "Unable to retrieve audit recommendations."}
        requestId={errorRequestId}
        onRetry={loadData}
        isRetrying={loading}
      />
    );
  }

  const pillars = review?.metrics_summary?.pillars;
  const runwayDisplay = formatRunway(pillars?.runway?.runway_months, pillars?.runway?.display, hasSufficient);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1
              style={{
                fontSize: "clamp(1.5rem, 3.5vw, 1.875rem)",
                fontWeight: 800,
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.03em",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Financial Audit & Smart Insights
            </h1>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Deterministic rule-based weekly reviews, health scoring, and actionable optimizations.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Segmented Control for Tabs (Fixes Bug #5) */}
          <SegmentedControl<"current" | "history">
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            options={[
              { id: "current", label: "Current Audit" },
              { id: "history", label: "History", icon: <History size={14} />, count: historyLogs.length },
            ]}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleGenerate}
            disabled={!isOnline || refreshing}
            icon={<RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />}
          >
            {refreshing ? "Auditing..." : "Re-Audit"}
          </Button>
        </div>
      </div>

      {activeTab === "current" && review && (
        <>
          {/* Health Score Overview Hero */}
          <div
            className="glass-panel"
            style={{
              padding: "26px 28px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "28px",
              alignItems: "center",
            }}
          >
            {/* Score Radial Box */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div
                style={{
                  width: "92px",
                  height: "92px",
                  borderRadius: "50%",
                  border: `4px solid ${getScoreColor(score)}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-surface-solid)",
                  flexShrink: 0,
                  boxShadow: `0 0 16px ${getScoreColor(score)}33`,
                }}
              >
                <span className="tabular-nums" style={{ fontSize: "28px", fontWeight: 800, color: getScoreColor(score), lineHeight: 1 }}>
                  {hasSufficient ? score : "—"}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", marginTop: "2px" }}>
                  {hasSufficient ? "/ 100" : "PROV"}
                </span>
              </div>

              <div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em" }}>
                  Financial Health Score
                </span>
                <h3 style={{ fontSize: "17px", fontWeight: 700, color: getScoreColor(score), margin: "4px 0" }}>
                  {getScoreGrade(score)}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Week of {review.week_start_date} · {review.suggestions.length} Findings
                </span>
              </div>
            </div>

            {/* 4 Pillar Bars */}
            {pillars && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Savings Rate */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <TrendingUp size={13} style={{ color: "var(--accent-primary)" }} />
                      Savings Rate ({formatSavingsRate(pillars.savings_rate.value_pct)})
                    </span>
                    <strong className="tabular-nums">{pillars.savings_rate.score} / 25 pts</strong>
                  </div>
                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(pillars.savings_rate.score / 25) * 100}%`,
                        background: "var(--accent-primary)",
                      }}
                    />
                  </div>
                </div>

                {/* Runway Buffer */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Shield size={13} style={{ color: "var(--success)" }} />
                      Runway Buffer ({runwayDisplay})
                    </span>
                    <strong className="tabular-nums">{pillars.runway.score} / 25 pts</strong>
                  </div>
                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(pillars.runway.score / 25) * 100}%`,
                        background: "var(--success)",
                      }}
                    />
                  </div>
                </div>

                {/* Debt Burden */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <CreditCard size={13} style={{ color: "var(--warning)" }} />
                      Debt Burden (DTI: {formatDTI(pillars.debt_burden.dti_pct)})
                    </span>
                    <strong className="tabular-nums">{pillars.debt_burden.score} / 25 pts</strong>
                  </div>
                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(pillars.debt_burden.score / 25) * 100}%`,
                        background: "var(--warning)",
                      }}
                    />
                  </div>
                </div>

                {/* Budget Adherence */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <PieChart size={13} style={{ color: "var(--accent-secondary)" }} />
                      Budget Adherence ({pillars.budget_adherence.exceeded || 0} Exceeded)
                    </span>
                    <strong className="tabular-nums">{pillars.budget_adherence.score} / 25 pts</strong>
                  </div>
                  <div className="progress-bar-bg" style={{ height: "6px" }}>
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(pillars.budget_adherence.score / 25) * 100}%`,
                        background: "var(--accent-secondary)",
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filter Chips for Findings */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>Filter Findings:</span>
            {[
              { id: "all", label: "All", count: countBySeverity.all },
              { id: "critical", label: "Critical", count: countBySeverity.critical },
              { id: "warning", label: "Warnings", count: countBySeverity.warning },
              { id: "info", label: "Informational", count: countBySeverity.info },
            ].map((f) => {
              const isSelected = filterSeverity === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterSeverity(f.id)}
                  className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    padding: "6px 12px",
                    minHeight: "34px",
                    fontSize: "12px",
                    gap: "6px",
                  }}
                >
                  <span>{f.label}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "1px 6px",
                      borderRadius: "999px",
                      background: isSelected ? "rgba(255,255,255,0.25)" : "var(--bg-surface-solid)",
                      fontWeight: 700,
                    }}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Findings List */}
          {filteredSuggestions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={28} style={{ color: "var(--success)" }} />}
              title="All Financial Indicators Healthy"
              description="No optimization issues found matching this filter. Your accounts align with discipline rules."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {filteredSuggestions.map((item, idx) => {
                const isCrit = item.severity === "critical";
                const isWarn = item.severity === "warning";

                return (
                  <div
                    key={idx}
                    className="glass-panel"
                    style={{
                      padding: "20px 22px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      borderColor: isCrit ? "var(--danger-border)" : isWarn ? "var(--warning-border)" : "var(--border-color)",
                      background: isCrit ? "var(--danger-bg)" : isWarn ? "var(--warning-bg)" : "var(--bg-surface)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "8px",
                            background: isCrit ? "var(--danger)" : isWarn ? "var(--warning)" : "var(--accent-primary)",
                            color: "#ffffff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {isCrit ? <AlertCircle size={16} /> : isWarn ? <AlertTriangle size={16} /> : <Info size={16} />}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <Badge variant={isCrit ? "danger" : isWarn ? "warning" : "info"} size="sm">
                              {item.severity.toUpperCase()}
                            </Badge>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                              {item.category}
                            </span>
                          </div>
                          <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                            {item.title}
                          </h4>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleAskCouncilForFinding(item.title)}
                        icon={<Scale size={14} style={{ color: "var(--accent-secondary)" }} />}
                        title="Convene AI Council regarding this finding"
                      >
                        Ask Council
                      </Button>
                    </div>

                    <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.5, marginLeft: "42px" }}>
                      {item.description}
                    </p>

                    {item.actionable_step && (
                      <div
                        style={{
                          marginLeft: "42px",
                          padding: "10px 14px",
                          borderRadius: "var(--radius-sm)",
                          background: "var(--bg-surface-solid)",
                          border: "1px solid var(--border-color)",
                          fontSize: "13px",
                          color: "var(--text-primary)",
                        }}
                      >
                        <strong>Recommended Action:</strong> {item.actionable_step}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* History Tab: Past Weekly Audit Timeline */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {historyLogs.length === 0 ? (
            <EmptyState
              icon={<History size={28} />}
              title="No previous audit snapshots"
              description="Past weekly health audits will be archived here as you continue using MoneyCouncil."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {historyLogs.map((log) => {
                const sc = log.findings?.health_score ?? 50;
                const genDate = log.findings?.generated_at || log.created_at;
                const findingsCount = log.findings?.suggestions?.length ?? 0;
                return (
                  <div
                    key={log.id}
                    className="glass-panel"
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "16px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "50%",
                          border: `3px solid ${getScoreColor(sc)}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: "16px",
                          color: getScoreColor(sc),
                        }}
                      >
                        {sc}
                      </div>
                      <div>
                        <h4 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                          Week of {log.week_start_date}
                        </h4>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          Audited on {new Date(genDate).toLocaleDateString()} · {findingsCount} findings
                        </span>
                      </div>
                    </div>

                    <Badge variant={sc >= 75 ? "success" : sc >= 50 ? "warning" : "danger"} size="sm">
                      {getScoreGrade(sc)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
