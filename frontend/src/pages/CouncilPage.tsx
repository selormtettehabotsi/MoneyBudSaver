import React, { useState, useEffect, useRef } from "react";
import { councilApi } from "../api/council";
import { CouncilDecision, CouncilJobStatus, ProviderStatusItem, TestConnectionResponse } from "../types/council";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import { CouncilVoteCard } from "../components/council/CouncilVoteCard";
import { CouncilTallyPanel } from "../components/council/CouncilTallyPanel";
import { Modal } from "../components/common/Modal";
import { DisclaimerBanner } from "../components/common/DisclaimerBanner";
import {
  Scale,
  Cpu,
  History,
  RefreshCw,
  Sparkles,
  Eye,
  CheckCircle2,
  XCircle,
  Edit3,
  Layers,
  AlertTriangle,
  AlertCircle,
  Activity,
  Info,
  Timer,
  Copy,
  ExternalLink,
  XOctagon,
} from "lucide-react";

interface CouncilPageProps {
  initialQuestion?: string;
}

export const CouncilPage: React.FC<CouncilPageProps> = ({ initialQuestion }) => {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const { loadCachedOrFetch, isOnline } = useSync();

  const isHosted = user?.is_hosted || false;

  // Form State
  const [question, setQuestion] = useState(initialQuestion || "");
  const [decisionType, setDecisionType] = useState<string>("borrow");
  const [candidateAmount, setCandidateAmount] = useState<string>("2000.00");
  const [enableDebate, setEnableDebate] = useState<boolean>(true);
  const [localOnlyMode, setLocalOnlyMode] = useState<boolean>(false);

  // Deliberation State
  const [loading, setLoading] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [jobProgress, setJobProgress] = useState<CouncilJobStatus | null>(null);
  const [currentDecision, setCurrentDecision] = useState<CouncilDecision | null>(null);
  const [activeConflictJobId, setActiveConflictJobId] = useState<string | null>(null);
  const activeIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Providers Status
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [history, setHistory] = useState<CouncilDecision[]>([]);

  // Test All Providers State
  const [isTestAllOpen, setIsTestAllOpen] = useState(false);
  const [testAllLoading, setTestAllLoading] = useState(false);
  const [testAllResults, setTestAllResults] = useState<Record<string, TestConnectionResponse>>({});

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    sanitized_question: string;
    anonymized_prompt: string;
    financial_snapshot: Record<string, any>;
  } | null>(null);

  // Decision Modal State
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionVerdictToSubmit, setDecisionVerdictToSubmit] = useState<"accepted" | "rejected" | "modified">("accepted");
  const [decisionNotes, setDecisionNotes] = useState("");

  const loadProvidersAndHistory = async () => {
    try {
      const [pList, hList] = await Promise.all([
        loadCachedOrFetch("council_providers", () => councilApi.getProviders(), (c) => { if (c) setProviders(c); }),
        loadCachedOrFetch("council_history", () => councilApi.getHistory(10), (c) => { if (c) setHistory(c); }),
      ]);
      if (pList) setProviders(pList);
      if (hList) setHistory(hList);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProvidersAndHistory();
  }, []);

  const handleTestAllProviders = async () => {
    setTestAllLoading(true);
    setIsTestAllOpen(true);
    setTestAllResults({});

    const configuredProviders = providers.filter((p) => p.is_configured && p.status !== "disabled_in_hosted");
    const resultsMap: Record<string, TestConnectionResponse> = {};

    try {
      // Stagger requests sequentially to prevent rate limits and bursting
      for (const p of configuredProviders) {
        try {
          const res = await councilApi.testConnection(p.name, p.model_id);
          resultsMap[p.name] = res;
          setTestAllResults({ ...resultsMap });
        } catch (err: any) {
          const isRateLimit = err?.status === 429 || (err?.message && err.message.toLowerCase().includes("rate limit"));
          resultsMap[p.name] = {
            provider_name: p.name,
            model_id: p.model_id,
            http_status: isRateLimit ? 429 : null,
            latency_ms: 0,
            status: isRateLimit ? "rate_limited" : "error",
            diagnosis: isRateLimit
              ? "Rate limit exceeded (10 tests/min). Please wait a moment."
              : err.message || "Connection test failed.",
            model_found_in_list: null,
            available_models_count: 0,
            close_matches: [],
          };
          setTestAllResults({ ...resultsMap });
        }
        // Stagger spacing between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      setTestAllLoading(false);
    }
  };

  const handleCancelJob = async (jobId?: string) => {
    const targetId = jobId || jobProgress?.job_id;
    if (!targetId) return;

    if (activeIntervalRef.current) {
      clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = null;
    }

    try {
      await councilApi.cancelJob(targetId);
      setLoading(false);
      setRetryingFailed(false);
      setJobProgress(null);
      setActiveConflictJobId(null);
      loadProvidersAndHistory();
    } catch (err: any) {
      alert(err.message || "Failed to cancel deliberation job.");
    }
  };

  const handleResetCircuitBreaker = async (providerName: string) => {
    try {
      await councilApi.resetCircuitBreaker(providerName);
      await loadProvidersAndHistory();
    } catch (err: any) {
      alert(err.message || "Failed to reset circuit breaker.");
    }
  };

  const handleRetryFailed = async () => {
    if (!currentDecision) return;
    setRetryingFailed(true);
    try {
      const job = await councilApi.retryFailed(currentDecision.id);
      setJobProgress(job);

      if (job.status === "completed" && job.decision) {
        setCurrentDecision(job.decision);
        setRetryingFailed(false);
        loadProvidersAndHistory();
        return;
      }

      // Poll background status every 1.5s
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = setInterval(async () => {
        try {
          const currentJob = await councilApi.getJobStatus(job.job_id);
          setJobProgress(currentJob);

          if (currentJob.status === "completed") {
            if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
            if (currentJob.decision) {
              setCurrentDecision(currentJob.decision);
            }
            setRetryingFailed(false);
            loadProvidersAndHistory();
          } else if (currentJob.status === "failed" || currentJob.status === "cancelled") {
            if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
            setRetryingFailed(false);
            if (currentJob.status === "failed") alert(currentJob.error || "Retry failed.");
            loadProvidersAndHistory();
          }
        } catch (pollErr: any) {
          console.error("Retry polling error:", pollErr);
        }
      }, 1500);
    } catch (err: any) {
      alert(err.message || "Failed to retry providers.");
      setRetryingFailed(false);
    }
  };

  const handlePreviewPrompt = async () => {
    if (!question.trim()) return;
    setPreviewLoading(true);
    setIsPreviewOpen(true);
    try {
      const res = await councilApi.preview({
        question: question.trim(),
        decision_type: decisionType,
        candidate_amount: candidateAmount ? candidateAmount : null,
      });
      setPreviewData(res);
    } catch (err: any) {
      alert(err.message || "Failed to generate prompt preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAskCouncil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setCurrentDecision(null);
    setJobProgress(null);
    setActiveConflictJobId(null);

    try {
      const job = await councilApi.ask({
        question: question.trim(),
        decision_type: decisionType,
        candidate_amount: candidateAmount ? candidateAmount : null,
        enable_debate: enableDebate,
        local_only_mode: localOnlyMode,
      });

      setJobProgress(job);

      if (job.status === "completed" && job.decision) {
        setCurrentDecision(job.decision);
        setLoading(false);
        loadProvidersAndHistory();
        return;
      }

      // Poll background status every 1.5s
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
      activeIntervalRef.current = setInterval(async () => {
        try {
          const currentJob = await councilApi.getJobStatus(job.job_id);
          setJobProgress(currentJob);

          if (currentJob.status === "completed") {
            if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
            if (currentJob.decision) {
              setCurrentDecision(currentJob.decision);
            }
            setLoading(false);
            loadProvidersAndHistory();
          } else if (currentJob.status === "failed" || currentJob.status === "cancelled") {
            if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
            setLoading(false);
            if (currentJob.status === "failed") alert(currentJob.error || "Council deliberation failed.");
            loadProvidersAndHistory();
          }
        } catch (pollErr: any) {
          console.error("Deliberation polling error:", pollErr);
        }
      }, 1500);

    } catch (err: any) {
      const msg = err.message || "Council deliberation failed to start.";
      const match = msg.match(/Job ID:\s*([a-zA-Z0-9-]+)/);
      if (match) {
        setActiveConflictJobId(match[1]);
      }
      alert(msg);
      setLoading(false);
    }
  };

  const handlePromptUserDecision = (verdict: "accepted" | "rejected" | "modified") => {
    setDecisionVerdictToSubmit(verdict);
    setDecisionNotes("");
    setIsDecisionModalOpen(true);
  };

  const handleSaveUserDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDecision) return;

    try {
      const updated = await councilApi.recordDecision(
        currentDecision.id,
        decisionVerdictToSubmit,
        decisionNotes || undefined
      );
      setCurrentDecision(updated);
      setIsDecisionModalOpen(false);
      loadProvidersAndHistory();
    } catch (err: any) {
      alert(err.message || "Failed to record decision.");
    }
  };

  const sampleQuestions = [
    { text: "Should I borrow GHS 2,000 for a laptop upgrade to increase freelance output?", type: "borrow", amount: "2000.00" },
    { text: "Should I buy a smartphone for GHS 1,500 cash from my emergency savings?", type: "purchase", amount: "1500.00" },
    { text: "Should I invest GHS 3,000 lump sum into government treasury bills?", type: "investment", amount: "3000.00" },
  ];

  // Calculate active distinct model families for diversity check (enabled & healthy)
  const workingProviders = providers.filter(
    (p) => p.status === "ready" && p.is_configured && p.enabled_in_council !== false && !p.circuit_breaker_tripped
  );
  const distinctFamilies = Array.from(new Set(workingProviders.map((p) => p.model_family).filter(Boolean)));
  const fewerThanFourFamilies = distinctFamilies.length < 4;

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px" }}>The AI Financial Council</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Multi-model debate, independent analysis, and confidence-weighted voting
          </span>
        </div>

        {/* Action & Active Providers Badges */}
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={!isOnline || testAllLoading}
            onClick={handleTestAllProviders}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            style={{ minHeight: "34px", padding: "5px 10px", fontSize: "12px" }}
            title="Test connection and latency of all configured providers"
          >
            {testAllLoading ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <Activity size={13} />
                <span>Test All Providers</span>
              </>
            )}
          </button>

          {providers.map((p) => {
            const isReady = p.status === "ready";
            const isTripped = p.circuit_breaker_tripped || p.status === "circuit_breaker_tripped";
            const statusLabel = isTripped
              ? "Temporarily Skipped"
              : isReady
              ? "Ready"
              : p.status === "missing_model_id"
              ? "Set Model ID"
              : p.status === "disabled_in_hosted"
              ? "Local Only"
              : p.status === "rate_limited"
              ? "Rate Limited"
              : "Not Configured";

            const badgeClass = isTripped
              ? "badge-warning"
              : isReady
              ? p.is_near_limit
                ? "badge-warning"
                : "badge-success"
              : "badge-secondary";

            return (
              <span
                key={p.name}
                className={`badge ${badgeClass}`}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  opacity: isReady || isTripped ? 1 : 0.75,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title={`${p.display_name} • ${p.model_family} (${p.model_id || "no model"}) - ${statusLabel}${
                  isTripped && p.circuit_breaker_reason ? ` (${p.circuit_breaker_reason})` : ""
                }${p.shares_key_with ? " • Shares rate limit with " + p.shares_key_with : ""}${
                  p.daily_quota_limit ? ` • Today: ${p.daily_request_count}/${p.daily_quota_limit}` : ""
                }`}
              >
                <Cpu size={12} />
                <span>
                  {p.display_name}: {statusLabel}
                </span>
                {isTripped && (
                  <button
                    type="button"
                    onClick={() => handleResetCircuitBreaker(p.name)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      cursor: "pointer",
                      textDecoration: "underline",
                      fontSize: "10px",
                      fontWeight: 600,
                      padding: "0 2px",
                    }}
                    title="Clear circuit breaker cooldown and retry immediately"
                  >
                    Retry now
                  </button>
                )}
                {p.shares_key_with && isReady && (
                  <span style={{ fontSize: "9px", opacity: 0.8, fontStyle: "italic" }}>(shared limit)</span>
                )}
                {isReady && p.daily_quota_limit && (
                  <span style={{ fontSize: "10px", opacity: 0.85, marginLeft: "2px" }}>
                    [{p.daily_request_count}/{p.daily_quota_limit}]
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>

      <DisclaimerBanner />

      {/* Active Conflict Banner with One-Click Cancel */}
      {activeConflictJobId && (
        <div
          className="glass-panel flex items-center justify-between gap-3"
          style={{
            padding: "14px 18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background: "rgba(239, 68, 68, 0.08)",
          }}
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle size={20} className="text-rose-400" />
            <div>
              <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                Active Deliberation In Progress
              </strong>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Job ID: <code>{activeConflictJobId}</code> is currently occupying the council. You can cancel it to start a new one.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCancelJob(activeConflictJobId)}
            className="btn btn-danger btn-sm flex items-center gap-1.5"
            style={{ minHeight: "36px", padding: "6px 12px", fontSize: "12px" }}
          >
            <XOctagon size={14} />
            <span>Cancel Active Job</span>
          </button>
        </div>
      )}

      {/* Model Family Diversity Warning Banner */}
      {fewerThanFourFamilies && (
        <div
          className="glass-panel flex items-start gap-3"
          style={{
            padding: "14px 18px",
            borderRadius: "var(--radius-md)",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            background: "rgba(245, 158, 11, 0.08)",
          }}
        >
          <AlertTriangle size={20} style={{ color: "var(--accent-warning)", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "13px", lineHeight: "1.5" }}>
            <strong style={{ color: "var(--text-primary)" }}>
              Model Family Diversity Notice ({distinctFamilies.length} Working {distinctFamilies.length === 1 ? "Family" : "Families"})
            </strong>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
              Fewer than 4 distinct AI model families are enabled and working (currently active:{" "}
              {distinctFamilies.length > 0 ? (
                <strong>{distinctFamilies.join(", ")}</strong>
              ) : (
                <em>None working yet</em>
              )}
              ). At least 4 distinct model families are recommended for robust multi-perspective deliberation.
            </p>
          </div>
        </div>
      )}

      {/* Main Deliberation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Deliberation Chamber & Output */}
        <div className="lg:col-span-2 flex flex-col gap-6" style={{ width: "100%" }}>
          {/* Question Form */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h3 style={{ fontSize: "17px", marginBottom: "12px" }}>Submit a Decision to the Council</h3>

            {/* Quick Sample Presets */}
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: "14px" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", alignSelf: "center" }}>Presets:</span>
              {sampleQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(q.text);
                    setDecisionType(q.type);
                    setCandidateAmount(q.amount);
                  }}
                  className="btn-secondary"
                  style={{
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 12px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    minHeight: "44px",
                    cursor: "pointer",
                  }}
                >
                  {q.type.toUpperCase()}
                </button>
              ))}
            </div>

            <form onSubmit={handleAskCouncil} className="flex flex-col gap-4">
              <div className="input-group">
                <label className="input-label">Your Financial Question / Dilemma</label>
                <textarea
                  required
                  rows={3}
                  className="input-field"
                  placeholder="e.g. Can I afford to take a GHS 2,500 inventory loan with my current cash flow?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ resize: "vertical", minHeight: "80px" }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="input-group">
                  <label className="input-label">Decision Type</label>
                  <select
                    className="input-field"
                    value={decisionType}
                    onChange={(e) => setDecisionType(e.target.value)}
                  >
                    <option value="borrow">Borrowing / Taking Debt</option>
                    <option value="purchase">Major Cash Purchase</option>
                    <option value="investment">Investment / Capital Allocation</option>
                    <option value="budget_cut">Expense / Budget Restructuring</option>
                    <option value="general">General Financial Strategy</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Proposed Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input-field"
                    placeholder="0.00"
                    value={candidateAmount}
                    onChange={(e) => setCandidateAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" style={{ margin: "4px 0" }}>
                <label className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={enableDebate}
                    onChange={(e) => setEnableDebate(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>Enable Round 2 Debate (Peer debate & re-voting)</span>
                </label>

                <label
                  className="flex items-center gap-2"
                  style={{
                    cursor: isHosted ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    opacity: isHosted ? 0.5 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={isHosted}
                    checked={localOnlyMode}
                    onChange={(e) => setLocalOnlyMode(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>Local-Only (Ollama)</span>
                </label>
              </div>

              {!isOnline && (
                <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
                  <AlertCircle size={14} />
                  <span>AI Council deliberation requires an active internet connection.</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3" style={{ marginTop: "6px" }}>
                <button
                  type="button"
                  disabled={!isOnline || !question.trim() || loading}
                  onClick={handlePreviewPrompt}
                  className="btn btn-secondary flex items-center justify-center gap-2"
                  style={{ minHeight: "44px", width: "100%", flex: 1 }}
                  title={!isOnline ? "Prompt preview requires an active connection" : undefined}
                >
                  <Eye size={16} />
                  <span>Preview AI Prompt</span>
                </button>

                <button
                  type="submit"
                  disabled={!isOnline || loading || !question.trim()}
                  className="btn btn-primary flex items-center justify-center gap-2"
                  style={{ minHeight: "44px", width: "100%", flex: 2 }}
                  title={!isOnline ? "Deliberation requires an active connection" : undefined}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin text-white" style={{ animation: "spin 1s linear infinite" }} />
                      <span>Council is Deliberating...</span>
                    </>
                  ) : (
                    <>
                      <Scale size={18} />
                      <span>Convene Council & Vote</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Loading Animation and Real-Time Deliberation Progress */}
          {loading && (
            <div
              className="glass-panel flex flex-col items-center justify-center"
              style={{ padding: "36px 20px", gap: "16px" }}
            >
              <Scale size={36} className="text-indigo-400" style={{ animation: "pulseGlow 1.5s ease-in-out infinite" }} />
              <div style={{ textAlign: "center", width: "100%", maxWidth: "560px" }}>
                <div className="flex items-center justify-center gap-2" style={{ marginBottom: "6px" }}>
                  <h3 style={{ fontSize: "17px" }}>Council Members are Voting & Debating...</h3>
                  {jobProgress && (
                    <span className="badge badge-info" style={{ fontSize: "11px" }}>
                      Round {jobProgress.current_round} of {jobProgress.total_rounds}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Feeding pre-computed financial ratios to models, evaluating risks, and debating consensus.
                </p>

                {/* Per-Provider Live Progress Chips */}
                {jobProgress && jobProgress.providers_progress && Object.keys(jobProgress.providers_progress).length > 0 && (
                  <div
                    className="flex items-center justify-center gap-2"
                    style={{ flexWrap: "wrap", marginTop: "14px" }}
                  >
                    {Object.entries(jobProgress.providers_progress).map(([pName, pStatus]) => {
                      const isDone = pStatus.includes("voted") || pStatus.includes("finished");
                      const isFailed = pStatus.includes("failed");
                      const isSkipped = pStatus.includes("Skipped") || pStatus.includes("Not Configured");

                      const badgeClass = isDone
                        ? "badge-success"
                        : isFailed
                        ? "badge-danger"
                        : isSkipped
                        ? "badge-secondary"
                        : "badge-warning";

                      return (
                        <span
                          key={pName}
                          className={`badge ${badgeClass}`}
                          style={{
                            fontSize: "12px",
                            padding: "5px 10px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <Cpu size={12} />
                          <span style={{ textTransform: "capitalize" }}>
                            {pName.replace("_", " ")}: {pStatus}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Cancel Deliberation Button */}
                <div style={{ marginTop: "18px" }}>
                  <button
                    type="button"
                    onClick={() => handleCancelJob()}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5"
                    style={{ margin: "0 auto", padding: "6px 14px", fontSize: "12px", color: "var(--accent-rose)" }}
                  >
                    <XOctagon size={14} />
                    <span>Cancel Deliberation</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Deliberation Results */}
          {currentDecision && !loading && (
            <div className="flex flex-col gap-6" style={{ width: "100%" }}>
              {/* Insufficient Data Notice Banner if history < 14 days */}
              {currentDecision.financial_snapshot?.has_sufficient_data === false && (
                <div
                  className="glass-panel flex items-start gap-3"
                  style={{
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(99, 102, 241, 0.35)",
                    background: "rgba(99, 102, 241, 0.08)",
                  }}
                >
                  <Info size={18} style={{ color: "var(--accent-primary)", flexShrink: 0, marginTop: "2px" }} />
                  <div style={{ fontSize: "13px", lineHeight: "1.4" }}>
                    <strong style={{ color: "var(--text-primary)" }}>Notice: Limited Spending History</strong>
                    <p style={{ margin: "2px 0 0 0", color: "var(--text-secondary)" }}>
                      {currentDecision.financial_snapshot.data_notice || "Add at least 2 weeks of spending for reliable advice."}
                    </p>
                  </div>
                </div>
              )}

              {/* Final Consensus Tally Panel */}
              <CouncilTallyPanel
                tally={currentDecision.final_tally}
                guardrailViolations={currentDecision.guardrail_breach?.guardrail_violations}
                userVerdict={currentDecision.user_verdict}
                userModifications={currentDecision.user_modifications}
                hasSufficientData={currentDecision.financial_snapshot?.has_sufficient_data}
                dataNotice={currentDecision.financial_snapshot?.data_notice}
                retryingFailed={retryingFailed}
                onRetryFailed={handleRetryFailed}
                onUserDecision={handlePromptUserDecision}
              />

              {/* Stacked Rounds Structure */}
              <div className="flex flex-col gap-5" style={{ width: "100%" }}>
                {/* Round 2 (if present) */}
                {currentDecision.round2_votes && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} style={{ color: "var(--accent-secondary)" }} />
                      <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
                        Round 2: Peer Debate & Revised Stances
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.values(currentDecision.round2_votes).map((vote: any, index: number) => (
                        <CouncilVoteCard key={`r2-${index}`} vote={vote} defaultExpanded={false} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Round 1 */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Layers size={16} style={{ color: "var(--text-secondary)" }} />
                    <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
                      Round 1: Independent Blind Voting
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.values(currentDecision.round1_votes).map((vote: any, index: number) => (
                      <CouncilVoteCard key={`r1-${index}`} vote={vote} defaultExpanded={!currentDecision.round2_votes} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Sticky Mobile Action Bar for Final Decision */}
              {!currentDecision.user_verdict && (
                <div
                  className="mobile-sticky-action-bar glass-panel flex items-center justify-between gap-2"
                  style={{
                    position: "sticky",
                    bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
                    zIndex: 400,
                    padding: "10px 14px",
                    background: "var(--bg-surface-solid)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-color)",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Your Say:
                  </span>
                  <div className="flex items-center gap-2" style={{ flex: 1, justifyContent: "flex-end" }}>
                    <button
                      disabled={currentDecision.final_tally.final_verdict === "no_quorum"}
                      onClick={() => handlePromptUserDecision("accepted")}
                      className="btn btn-sm btn-success flex items-center gap-1"
                      style={{
                        minHeight: "38px",
                        opacity: currentDecision.final_tally.final_verdict === "no_quorum" ? 0.4 : 1,
                      }}
                      title={currentDecision.final_tally.final_verdict === "no_quorum" ? "Quorum not met" : undefined}
                    >
                      <CheckCircle2 size={14} />
                      <span>Accept</span>
                    </button>
                    <button
                      onClick={() => handlePromptUserDecision("modified")}
                      className="btn btn-sm btn-secondary flex items-center gap-1"
                      style={{ minHeight: "38px" }}
                    >
                      <Edit3 size={14} />
                      <span>Modify</span>
                    </button>
                    <button
                      onClick={() => handlePromptUserDecision("rejected")}
                      className="btn btn-sm btn-danger flex items-center gap-1"
                      style={{ minHeight: "38px" }}
                    >
                      <XCircle size={14} />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* History Sidebar / Column */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel" style={{ padding: "20px" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: "14px" }}>
              <History size={18} style={{ color: "var(--accent-secondary)" }} />
              <h3 style={{ fontSize: "16px" }}>Past Deliberations</h3>
            </div>

            {history.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                No past inquiries recorded.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setCurrentDecision(item);
                    }}
                    style={{
                      padding: "10px 12px",
                      background: currentDecision?.id === item.id ? "var(--bg-surface-hover)" : "var(--bg-surface-solid)",
                      borderRadius: "var(--radius-md)",
                      border: currentDecision?.id === item.id ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: "4px" }}>
                      <span className="badge badge-info" style={{ fontSize: "10px" }}>
                        {item.decision_type.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.question}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test All Providers Results Modal */}
      <Modal
        isOpen={isTestAllOpen}
        onClose={() => setIsTestAllOpen(false)}
        title="Council Provider Connectivity & Latency Benchmark"
        maxWidth="680px"
      >
        <div className="flex flex-col gap-4">
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Ping tests sent to all active model families with non-financial verification prompts:
          </p>

          <div className="flex flex-col gap-2.5">
            {providers
              .filter((p) => p.is_configured && p.status !== "disabled_in_hosted")
              .map((p) => {
                const res = testAllResults[p.name];
                return (
                  <div
                    key={p.name}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ gap: "8px", flexWrap: "wrap" }}>
                      <div className="flex items-center gap-2.5">
                        <Cpu size={16} style={{ color: "var(--accent-primary)" }} />
                        <div>
                          <strong style={{ fontSize: "13px" }}>{p.display_name}</strong>
                          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {p.model_family} • <code>{p.model_id}</code>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {res ? (
                          <>
                            <span
                              className={`badge ${
                                res.status === "success"
                                  ? "badge-success"
                                  : res.status === "invalid_key"
                                  ? "badge-danger"
                                  : "badge-warning"
                              }`}
                              style={{ fontSize: "11px", textTransform: "capitalize" }}
                            >
                              {res.status.replace("_", " ")}
                            </span>

                            {res.catalog_ok !== undefined && (
                              <span className={`badge ${res.catalog_ok ? "badge-info" : "badge-secondary"}`} style={{ fontSize: "10px" }}>
                                Catalog: {res.catalog_ok ? "OK" : "Failed"}
                              </span>
                            )}

                            {res.chat_status && (
                              <span className={`badge ${res.chat_status === "success" ? "badge-success" : "badge-warning"}`} style={{ fontSize: "10px" }}>
                                Chat: {res.chat_status}
                              </span>
                            )}

                            {res.ttft_ms !== null && res.ttft_ms !== undefined && (
                              <span className="badge badge-secondary flex items-center gap-1" style={{ fontSize: "10px" }} title="Time to first token">
                                <Timer size={10} />
                                <span>TTFT: {res.ttft_ms}ms</span>
                              </span>
                            )}

                            {res.latency_ms > 0 && (
                              <span className="badge badge-secondary flex items-center gap-1" style={{ fontSize: "11px" }}>
                                <span>{res.latency_ms >= 1000 ? `${(res.latency_ms / 1000).toFixed(1)}s` : `${res.latency_ms}ms`}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="badge badge-secondary flex items-center gap-1" style={{ fontSize: "11px" }}>
                            <RefreshCw size={11} className="animate-spin" />
                            <span>Testing...</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {res && res.diagnosis && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.3" }}>
                        {res.diagnosis}
                      </div>
                    )}

                    {/* Rate Limit Retry-After Warning */}
                    {res?.retry_after_seconds && (
                      <div className="badge-warning flex items-center gap-1.5" style={{ padding: "4px 8px", borderRadius: "var(--radius-xs)", fontSize: "11px" }}>
                        <AlertCircle size={12} />
                        <span>Rate limited. Recommended retry in <strong>{res.retry_after_seconds} seconds</strong>.</span>
                      </div>
                    )}

                    {/* OpenRouter Privacy Hint */}
                    {res?.privacy_hint && (
                      <div className="badge-warning flex items-start gap-1.5" style={{ padding: "6px 8px", borderRadius: "var(--radius-xs)", fontSize: "11px" }}>
                        <Info size={12} style={{ flexShrink: 0, marginTop: "2px" }} />
                        <div>
                          <span>{res.privacy_hint}</span>{" "}
                          <a
                            href="https://openrouter.ai/settings/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "underline", color: "var(--accent-primary)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px" }}
                          >
                            <span>OpenRouter Privacy Settings</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>
                    )}

                    {/* OpenRouter Free Models with One-Click Copy */}
                    {res?.free_models && res.free_models.length > 0 && (
                      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", marginTop: "2px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Available Free Models ({res.free_models.length} zero-price):
                        </div>
                        <div className="flex flex-wrap gap-1" style={{ maxHeight: "100px", overflowY: "auto" }}>
                          {res.free_models.map((mId) => (
                            <button
                              key={mId}
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(mId);
                                alert(`Copied model ID:\n${mId}`);
                              }}
                              className="btn btn-secondary btn-sm flex items-center gap-1"
                              style={{ padding: "2px 6px", fontSize: "10px", minHeight: "22px" }}
                            >
                              <Copy size={9} />
                              <code>{mId}</code>
                              <span className="badge badge-success" style={{ fontSize: "8px", padding: "0 2px" }}>Free</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div className="flex justify-end" style={{ marginTop: "6px" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsTestAllOpen(false)}
              style={{ minHeight: "44px" }}
            >
              Close Benchmark
            </button>
          </div>
        </div>
      </Modal>

      {/* Prompt Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Server-Sanitized Prompt Preview"
        maxWidth="640px"
      >
        {previewLoading ? (
          <div className="flex flex-col items-center justify-center" style={{ padding: "32px 0", gap: "10px" }}>
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Computing deterministic ratios and scrubbing PII...
            </span>
          </div>
        ) : previewData ? (
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              The following payload is generated server-side. Private names, emails, and account numbers are scrubbed before reaching any external AI models:
            </p>
            <pre
              style={{
                background: "var(--bg-surface-solid)",
                padding: "14px",
                borderRadius: "var(--radius-md)",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--text-primary)",
                maxHeight: "360px",
                overflowY: "auto",
                border: "1px solid var(--border-color)",
              }}
            >
              {previewData.anonymized_prompt}
            </pre>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsPreviewOpen(false)}
                style={{ minHeight: "44px" }}
              >
                Close Preview
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* User Decision Modal */}
      <Modal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
        title="Record Your Final Decision"
      >
        <form onSubmit={handleSaveUserDecision} className="flex flex-col gap-4">
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            The Council advises, but the final choice is always 100% yours. Record your stance:
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`btn btn-sm ${decisionVerdictToSubmit === "accepted" ? "btn-success" : "btn-secondary"}`}
              style={{ flex: 1, minHeight: "44px" }}
              onClick={() => setDecisionVerdictToSubmit("accepted")}
            >
              Accept Council
            </button>
            <button
              type="button"
              className={`btn btn-sm ${decisionVerdictToSubmit === "modified" ? "btn-primary" : "btn-secondary"}`}
              style={{ flex: 1, minHeight: "44px" }}
              onClick={() => setDecisionVerdictToSubmit("modified")}
            >
              Modify Plan
            </button>
            <button
              type="button"
              className={`btn btn-sm ${decisionVerdictToSubmit === "rejected" ? "btn-danger" : "btn-secondary"}`}
              style={{ flex: 1, minHeight: "44px" }}
              onClick={() => setDecisionVerdictToSubmit("rejected")}
            >
              Reject Council
            </button>
          </div>

          <div className="input-group">
            <label className="input-label">Notes or Modifications</label>
            <textarea
              rows={3}
              className="input-field"
              placeholder="e.g. Taking loan but negotiating lower interest rate or buying refurbished model..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2" style={{ marginTop: "6px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsDecisionModalOpen(false)}
              style={{ minHeight: "44px" }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ minHeight: "44px" }}>
              Save Final Decision
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
