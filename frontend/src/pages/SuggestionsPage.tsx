import React, { useState, useEffect } from "react";
import { suggestionsApi, WeeklyReviewResult, SuggestionLogOut, SuggestionItem } from "../api/suggestions";
import { DisclaimerBanner } from "../components/common/DisclaimerBanner";
import {
  Sparkles,
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
  ArrowRight,
} from "lucide-react";

interface SuggestionsPageProps {
  onNavigateToCouncil?: (prefillQuery?: string) => void;
}

export const SuggestionsPage: React.FC<SuggestionsPageProps> = ({ onNavigateToCouncil }) => {
  const [review, setReview] = useState<WeeklyReviewResult | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SuggestionLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");

  const loadData = async () => {
    try {
      setLoading(true);
      const [reviewRes, historyRes] = await Promise.all([
        suggestionsApi.getWeeklyReview(),
        suggestionsApi.getHistory(),
      ]);
      setReview(reviewRes);
      setHistoryLogs(historyRes);
    } catch (err) {
      console.error("Failed to load suggestions:", err);
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
    } catch (err) {
      console.error("Failed to re-generate review:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 75) return "var(--success)";
    if (score >= 50) return "var(--warning)";
    return "var(--danger)";
  };

  const getScoreGrade = (score: number) => {
    if (score >= 85) return "Excellent Financial Resilience";
    if (score >= 70) return "Healthy & Stable Position";
    if (score >= 50) return "Moderate - Action Advised";
    return "Vulnerable - Critical Adjustments Required";
  };

  const filteredSuggestions = review?.suggestions.filter((item) => {
    if (filterSeverity === "all") return true;
    return item.severity === filterSeverity;
  }) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "50vh" }}>
        <RefreshCw size={28} className="text-indigo-400" style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  const score = review?.health_score ?? 50;
  const pillars = review?.metrics_summary?.pillars;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "26px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={28} style={{ color: "var(--brand-primary)" }} />
            Financial Audit & Smart Insights
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Deterministic rule-based weekly reviews, health scoring, and actionable optimizations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center" style={{ background: "var(--bg-secondary)", borderRadius: "8px", padding: "4px" }}>
            <button
              className={`btn btn-sm ${activeTab === "current" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab("current")}
            >
              Current Audit
            </button>
            <button
              className={`btn btn-sm ${activeTab === "history" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setActiveTab("history")}
            >
              <History size={14} style={{ marginRight: "6px" }} />
              History ({historyLogs.length})
            </button>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleGenerate}
            disabled={refreshing}
          >
            <RefreshCw size={15} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            <span>{refreshing ? "Auditing..." : "Re-Audit"}</span>
          </button>
        </div>
      </div>

      <DisclaimerBanner />

      {activeTab === "current" && review && (
        <>
          {/* Health Score Overview Card */}
          <div
            className="glass-panel"
            style={{
              padding: "24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "24px",
              alignItems: "center",
            }}
          >
            {/* Score Radial / Number Box */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div
                style={{
                  width: "90px",
                  height: "90px",
                  borderRadius: "50%",
                  border: `4px solid ${getScoreColor(score)}`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--bg-secondary)",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "28px", fontWeight: 700, color: getScoreColor(score) }}>{score}</span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>/ 100</span>
              </div>

              <div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Financial Health Score
                </span>
                <h3 style={{ fontSize: "18px", color: getScoreColor(score), margin: "4px 0" }}>
                  {getScoreGrade(score)}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Week of {review.week_start_date} • {review.suggestions.length} Findings
                </span>
              </div>
            </div>

            {/* 4 Pillars Progress Meters */}
            {pillars && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Savings Rate Pillar */}
                <div>
                  <div className="flex justify-between items-center" style={{ fontSize: "12px", marginBottom: "3px" }}>
                    <span className="flex items-center gap-1">
                      <TrendingUp size={13} style={{ color: "var(--brand-primary)" }} />
                      Savings Rate ({pillars.savings_rate.value_pct?.toFixed(1) || 0}%)
                    </span>
                    <span style={{ fontWeight: 600 }}>{pillars.savings_rate.score} / 25 pts</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(pillars.savings_rate.score / 25) * 100}%` }} />
                  </div>
                </div>

                {/* Emergency Runway Pillar */}
                <div>
                  <div className="flex justify-between items-center" style={{ fontSize: "12px", marginBottom: "3px" }}>
                    <span className="flex items-center gap-1">
                      <Shield size={13} style={{ color: "var(--success)" }} />
                      Runway Buffer ({pillars.runway.runway_months?.toFixed(1) || 0} mos)
                    </span>
                    <span style={{ fontWeight: 600 }}>{pillars.runway.score} / 25 pts</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(pillars.runway.score / 25) * 100}%`, background: "var(--success)" }} />
                  </div>
                </div>

                {/* Debt Burden Pillar */}
                <div>
                  <div className="flex justify-between items-center" style={{ fontSize: "12px", marginBottom: "3px" }}>
                    <span className="flex items-center gap-1">
                      <CreditCard size={13} style={{ color: "var(--warning)" }} />
                      Debt Burden (DTI: {pillars.debt_burden.dti_pct?.toFixed(1) || 0}%)
                    </span>
                    <span style={{ fontWeight: 600 }}>{pillars.debt_burden.score} / 25 pts</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(pillars.debt_burden.score / 25) * 100}%`, background: "var(--warning)" }} />
                  </div>
                </div>

                {/* Budget Adherence Pillar */}
                <div>
                  <div className="flex justify-between items-center" style={{ fontSize: "12px", marginBottom: "3px" }}>
                    <span className="flex items-center gap-1">
                      <PieChart size={13} style={{ color: "var(--brand-accent)" }} />
                      Budget Adherence ({pillars.budget_adherence.exceeded || 0} Exceeded)
                    </span>
                    <span style={{ fontWeight: 600 }}>{pillars.budget_adherence.score} / 25 pts</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(pillars.budget_adherence.score / 25) * 100}%`, background: "var(--brand-accent)" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Findings Filter Bar */}
          <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 600 }}>Filter Findings:</span>
              <button
                className={`btn btn-xs ${filterSeverity === "all" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilterSeverity("all")}
              >
                All ({review.suggestions.length})
              </button>
              <button
                className={`btn btn-xs ${filterSeverity === "critical" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilterSeverity("critical")}
              >
                Critical ({review.suggestions.filter((s) => s.severity === "critical").length})
              </button>
              <button
                className={`btn btn-xs ${filterSeverity === "warning" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilterSeverity("warning")}
              >
                Warnings ({review.suggestions.filter((s) => s.severity === "warning").length})
              </button>
              <button
                className={`btn btn-xs ${filterSeverity === "info" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilterSeverity("info")}
              >
                Info ({review.suggestions.filter((s) => s.severity === "info").length})
              </button>
            </div>
          </div>

          {/* Suggestions List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {filteredSuggestions.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: "40px" }}>
                <CheckCircle2 size={36} style={{ color: "var(--success)", margin: "0 auto 12px auto" }} />
                <h3>No findings in this category</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
                  Your finances match optimal safety metrics for this filter!
                </p>
              </div>
            ) : (
              filteredSuggestions.map((item: SuggestionItem, idx: number) => {
                const isCritical = item.severity === "critical";
                const isWarning = item.severity === "warning";

                return (
                  <div
                    key={idx}
                    className="glass-panel"
                    style={{
                      padding: "20px",
                      borderColor: isCritical
                        ? "var(--danger-border)"
                        : isWarning
                        ? "var(--warning-border)"
                        : "var(--border-color)",
                      background: isCritical
                        ? "rgba(244, 63, 94, 0.04)"
                        : isWarning
                        ? "rgba(245, 158, 11, 0.04)"
                        : "var(--bg-secondary)",
                    }}
                  >
                    <div className="flex items-start justify-between" style={{ gap: "12px", flexWrap: "wrap" }}>
                      <div className="flex items-start gap-3" style={{ flex: 1 }}>
                        <div
                          style={{
                            padding: "8px",
                            borderRadius: "8px",
                            background: isCritical
                              ? "var(--danger-bg)"
                              : isWarning
                              ? "var(--warning-bg)"
                              : "var(--bg-primary)",
                            color: isCritical
                              ? "var(--danger)"
                              : isWarning
                              ? "var(--warning)"
                              : "var(--brand-primary)",
                            marginTop: "2px",
                          }}
                        >
                          {isCritical ? (
                            <AlertCircle size={20} />
                          ) : isWarning ? (
                            <AlertTriangle size={20} />
                          ) : (
                            <Info size={20} />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2" style={{ marginBottom: "4px" }}>
                            <span
                              className={`badge ${
                                isCritical
                                  ? "badge-danger"
                                  : isWarning
                                  ? "badge-warning"
                                  : "badge-primary"
                              }`}
                            >
                              {item.severity.toUpperCase()}
                            </span>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "var(--text-muted)",
                                textTransform: "uppercase",
                                fontWeight: 600,
                              }}
                            >
                              {item.category.replace("_", " ")}
                            </span>
                          </div>

                          <h3 style={{ fontSize: "16px", marginBottom: "6px" }}>{item.title}</h3>
                          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: "1.5" }}>
                            {item.description}
                          </p>

                          {/* Actionable Step Box */}
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px 14px",
                              borderRadius: "8px",
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
                              Action:
                            </span>
                            <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                              {item.actionable_step}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Ask Council Action */}
                      {onNavigateToCouncil && (
                        <button
                          className="btn btn-secondary btn-sm flex items-center gap-1"
                          style={{ alignSelf: "flex-start" }}
                          onClick={() =>
                            onNavigateToCouncil(`Regarding my financial audit finding: "${item.title}". What steps should I take?`)
                          }
                          title="Ask the AI Council to deliberate on this finding"
                        >
                          <Scale size={14} />
                          <span>Ask Council</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {historyLogs.length === 0 ? (
            <div className="glass-panel text-center" style={{ padding: "40px" }}>
              <History size={36} style={{ color: "var(--text-muted)", margin: "0 auto 12px auto" }} />
              <h3>No Past Audits Found</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
                Past weekly audit snapshots will be archived here automatically.
              </p>
            </div>
          ) : (
            historyLogs.map((log: SuggestionLogOut) => {
              const findings = log.findings;
              const logScore = findings.health_score || 50;

              return (
                <div key={log.id} className="glass-panel" style={{ padding: "20px" }}>
                  <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          width: "48px",
                          height: "48px",
                          borderRadius: "50%",
                          border: `2px solid ${getScoreColor(logScore)}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "16px",
                          color: getScoreColor(logScore),
                        }}
                      >
                        {logScore}
                      </div>

                      <div>
                        <h4 style={{ fontSize: "16px" }}>Week of {log.week_start_date}</h4>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          Generated {new Date(log.created_at).toLocaleDateString()} •{" "}
                          {findings.suggestions?.length || 0} findings recorded
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="badge badge-primary">
                        Score: {logScore}/100
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
