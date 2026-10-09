import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { councilApi } from "../api/council";
import { CouncilDecision, CouncilJobStatus, ProviderStatusItem, TestConnectionResponse } from "../types/council";
import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";
import { useToast } from "../context/ToastContext";
import { getProviderStatusMeta } from "../utils/councilStatus";
import { CouncilVoteCard } from "../components/council/CouncilVoteCard";
import { CouncilTallyPanel } from "../components/council/CouncilTallyPanel";
import { AIModelsManager } from "../components/council/AIModelsManager";
import { Modal } from "../components/common/Modal";
import { Button } from "../components/common/Button";
import { Badge } from "../components/common/Badge";
import { MoneyInput } from "../components/common/MoneyInput";
import { LoadingProgress } from "../components/common/LoadingProgress";
import {
  Scale,
  Cpu,
  History,
  RefreshCw,
  Eye,
  AlertTriangle,
  AlertCircle,
  Activity,
  Copy,
  XOctagon,
  Wrench,
} from "lucide-react";

interface CouncilPageProps {
  initialQuestion?: string;
}

export const CouncilPage: React.FC<CouncilPageProps> = ({ initialQuestion }) => {
  const { decisionId } = useParams<{ decisionId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loadCachedOrFetch, isOnline } = useSync();
  const { success: toastSuccess, error: toastError } = useToast();

  const isHosted = user?.is_hosted || false;

  // Form State
  const [question, setQuestion] = useState(initialQuestion || "");
  const [decisionType, setDecisionType] = useState<string>("borrow");
  const [candidateAmount, setCandidateAmount] = useState<string>("2000.00");
  const [enableDebate, setEnableDebate] = useState<boolean>(true);
  const [localOnlyMode, setLocalOnlyMode] = useState<boolean>(false);

  // Expanded voter bench state
  const [expandedVoter, setExpandedVoter] = useState<string | null>(null);

  // Execution & Deliberation State
  const [loading, setLoading] = useState(false);
  const [retryingFailed, setRetryingFailed] = useState(false);
  const [currentDecision, setCurrentDecision] = useState<CouncilDecision | null>(null);
  const [jobProgress, setJobProgress] = useState<CouncilJobStatus | null>(null);
  const [activeConflictJobId, setActiveConflictJobId] = useState<string | null>(null);

  // Providers & Deliberation History
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [history, setHistory] = useState<CouncilDecision[]>([]);

  // Modals & Panels
  const [isAIModelsOpen, setIsAIModelsOpen] = useState(false);
  const [isTestAllOpen, setIsTestAllOpen] = useState(false);
  const [testAllLoading, setTestAllLoading] = useState(false);
  const [testAllResults, setTestAllResults] = useState<Record<string, TestConnectionResponse>>({});

  // Prompt Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ anonymized_prompt: string } | null>(null);

  // Decision Modal State
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionVerdictToSubmit, setDecisionVerdictToSubmit] = useState<"accepted" | "rejected" | "modified">("accepted");
  const [decisionNotes, setDecisionNotes] = useState("");

  const activeIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (activeIntervalRef.current) clearInterval(activeIntervalRef.current);
    };
  }, []);

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

  // Handle URL deep link /council/:decisionId
  useEffect(() => {
    if (decisionId) {
      councilApi
        .getDecision(decisionId)
        .then((dec) => {
          if (dec) setCurrentDecision(dec);
        })
        .catch((err) => {
          toastError(err.message || "Failed to load past deliberation.");
        });
    }
  }, [decisionId]);

  const handleTestAllProviders = async () => {
    setTestAllLoading(true);
    setIsTestAllOpen(true);
    setTestAllResults({});

    const configuredProviders = providers.filter((p) => p.is_configured && p.status !== "disabled_in_hosted");
    const resultsMap: Record<string, TestConnectionResponse> = {};

    try {
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
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      setTestAllLoading(false);
    }
  };

  const handleCancelJob = async (jobIdToCancel?: string) => {
    const targetId = jobIdToCancel || jobProgress?.job_id;
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
      toastSuccess("Deliberation cancelled.");
      loadProvidersAndHistory();
    } catch (err: any) {
      toastError(err.message || "Failed to cancel deliberation job.");
    }
  };

  const handleResetCircuitBreaker = async (providerName: string) => {
    try {
      await councilApi.resetCircuitBreaker(providerName);
      toastSuccess(`Circuit breaker reset for ${providerName}.`);
      await loadProvidersAndHistory();
    } catch (err: any) {
      toastError(err.message || "Failed to reset circuit breaker.");
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
            if (currentJob.status === "failed") toastError(currentJob.error || "Retry failed.");
            loadProvidersAndHistory();
          }
        } catch (pollErr: any) {
          console.error("Retry polling error:", pollErr);
        }
      }, 1500);
    } catch (err: any) {
      toastError(err.message || "Failed to retry providers.");
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
      toastError(err.message || "Failed to generate prompt preview.");
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
            if (currentJob.status === "failed") toastError(currentJob.error || "Council deliberation failed.");
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
      toastError(msg);
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
      toastSuccess("Final decision recorded.");
      loadProvidersAndHistory();
    } catch (err: any) {
      toastError(err.message || "Failed to record decision.");
    }
  };

  // Preset Questions
  const samplePresets = [
    {
      label: "Borrow GHS 2,000 for laptop",
      text: "Should I borrow GHS 2,000 for a laptop upgrade to increase freelance output?",
      type: "borrow",
      amount: "2000.00",
    },
    {
      label: "Buy phone GHS 1,500 from savings",
      text: "Should I buy a smartphone for GHS 1,500 cash from my emergency savings?",
      type: "purchase",
      amount: "1500.00",
    },
    {
      label: "Invest GHS 3,000 in T-Bills",
      text: "Should I invest GHS 3,000 lump sum into government treasury bills?",
      type: "investment",
      amount: "3000.00",
    },
  ];

  // Distinct working families check
  const readyProviders = providers.filter(
    (p) => (p.status === "ready" || p.status === "working") && p.is_configured && p.enabled_in_council !== false && !p.circuit_breaker_tripped
  );
  const distinctFamilies = Array.from(new Set(readyProviders.map((p) => p.model_family).filter(Boolean)));
  const fewerThanFourFamilies = distinctFamilies.length < 4;

  const brokenVoters = providers.filter(
    (p) => p.is_configured && p.enabled_in_council !== false && (!p.model_id || p.status === "missing_model_id" || p.status === "failed")
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      {/* 1. Header & Roster Controls */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1
            style={{
              fontSize: "clamp(1.5rem, 3.5vw, 1.875rem)",
              fontWeight: 800,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            The AI Financial Council
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Multi-model debate, independent analysis, and confidence-weighted voting.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleTestAllProviders}
            disabled={!isOnline || testAllLoading}
            icon={<Activity size={15} />}
          >
            {testAllLoading ? "Testing..." : "Test Providers"}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setIsAIModelsOpen(true)}
            icon={<Cpu size={15} />}
          >
            AI Models Manager
          </Button>
        </div>
      </div>

      {/* 2. Visual Council Bench Roster (Fixes Bug #2) */}
      <div
        className="glass-panel"
        style={{
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
              Council Roster:
            </span>
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              {readyProviders.length} of {providers.length} voters ready · {distinctFamilies.length} model families
            </span>
          </div>

          {fewerThanFourFamilies && (
            <Badge variant="warning" size="sm" icon={<AlertTriangle size={12} />}>
              Fewer than 4 families active
            </Badge>
          )}
        </div>

        {/* Voter Tiles Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: "10px",
          }}
        >
          {providers.map((p) => {
            const meta = getProviderStatusMeta(p.status, p.circuit_breaker_tripped, p.is_near_limit);
            const isTripped = p.circuit_breaker_tripped || p.status === "circuit_breaker_tripped";
            const isExpanded = expandedVoter === p.name;

            return (
              <div
                key={p.name}
                onClick={() => setExpandedVoter(isExpanded ? null : p.name)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: isExpanded ? "var(--bg-surface-hover)" : "var(--bg-surface-solid)",
                  border: isExpanded ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background:
                          meta.variant === "success"
                            ? "var(--success)"
                            : meta.variant === "warning"
                            ? "var(--warning)"
                            : meta.variant === "danger"
                            ? "var(--danger)"
                            : "var(--text-muted)",
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)" }}>
                      {p.display_name}
                    </span>
                  </div>
                  <Badge variant={meta.variant} size="sm">
                    {meta.label}
                  </Badge>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span>{p.model_family}</span>
                  {isTripped && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetCircuitBreaker(p.name);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-primary)",
                        cursor: "pointer",
                        fontWeight: 600,
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      Retry now
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", marginTop: "4px", fontSize: "11px" }}>
                    <div style={{ color: "var(--text-secondary)", marginBottom: "2px" }}>
                      Model: <code>{p.model_id || "None"}</code>
                    </div>
                    {p.shares_key_with && (
                      <div style={{ color: "var(--text-muted)" }}>Shares limit with {p.shares_key_with}</div>
                    )}
                    {p.daily_quota_limit ? (
                      <div style={{ color: "var(--text-muted)" }}>
                        Quota: {p.daily_request_count}/{p.daily_quota_limit} today
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Broken Voters Warning */}
      {brokenVoters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {brokenVoters.map((p) => (
            <div
              key={p.name}
              className="glass-panel"
              style={{
                padding: "12px 16px",
                border: "1px solid var(--danger-border)",
                background: "var(--danger-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0 }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Model ID for <strong>{p.display_name}</strong> needs configuration
                </span>
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsAIModelsOpen(true)}
                icon={<Wrench size={13} />}
              >
                Fix in AI Models
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Active Deliberation Conflict Alert */}
      {activeConflictJobId && (
        <div
          className="glass-panel"
          style={{
            padding: "14px 18px",
            border: "1px solid var(--danger-border)",
            background: "var(--danger-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertCircle size={20} style={{ color: "var(--danger)" }} />
            <div>
              <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
                Active Deliberation In Progress
              </strong>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Job ID: <code>{activeConflictJobId}</code> is occupying the council.
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => handleCancelJob(activeConflictJobId)}
            icon={<XOctagon size={14} />}
          >
            Cancel Active Job
          </Button>
        </div>
      )}

      {/* Main Grid: Form / Deliberation / Results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6" style={{ width: "100%" }}>
          {/* Ask Form */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "12px", fontFamily: "var(--font-display)" }}>
              Submit a Financial Decision to the Council
            </h3>

            {/* Presets wrapping cleanly */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>Presets:</span>
              {samplePresets.map((pr, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(pr.text);
                    setDecisionType(pr.type);
                    setCandidateAmount(pr.amount);
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{
                    fontSize: "12px",
                    padding: "6px 12px",
                    minHeight: "36px",
                  }}
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleAskCouncil} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="input-group">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="input-label">Your Financial Question or Dilemma</label>
                  <span style={{ fontSize: "11px", color: question.length > 950 ? "var(--danger)" : "var(--text-muted)" }}>
                    {question.length}/1000
                  </span>
                </div>
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  className="input-field"
                  placeholder="e.g. Can I afford to take a GHS 2,500 inventory loan with my current cash flow?"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ minHeight: "80px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
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

                <MoneyInput
                  label="Proposed Amount"
                  value={candidateAmount}
                  onChange={(val) => setCandidateAmount(val)}
                  placeholder="2000.00"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", margin: "4px 0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={enableDebate}
                    onChange={(e) => setEnableDebate(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>Enable Round 2 Debate (Peer debate & re-voting)</span>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: isHosted ? "not-allowed" : "pointer",
                    fontSize: "13px",
                    opacity: isHosted ? 0.5 : 1,
                  }}
                  title={isHosted ? "Ollama local mode is disabled in hosted deployments" : undefined}
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

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "6px" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handlePreviewPrompt}
                  disabled={!isOnline || !question.trim() || loading}
                  icon={<Eye size={16} />}
                  style={{ flex: 1 }}
                >
                  Preview AI Prompt
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={loading}
                  disabled={!isOnline || !question.trim()}
                  icon={<Scale size={16} />}
                  style={{ flex: 2 }}
                >
                  Convene Council & Vote
                </Button>
              </div>
            </form>
          </div>

          {/* Active Deliberation Progress View */}
          {loading && jobProgress && (
            <div
              className="glass-panel"
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <RefreshCw size={20} className="animate-spin text-indigo-400" />
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Council Deliberating...</h3>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Job ID: {jobProgress.job_id} · Round {jobProgress.current_round || 1}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => handleCancelJob()}
                >
                  Cancel Deliberation
                </Button>
              </div>

              {/* Progress 0 to 100% Bar */}
              <LoadingProgress
                compact
                progress={
                  jobProgress.current_round === 2
                    ? 82
                    : jobProgress.current_round === 1
                    ? 45
                    : 18
                }
                message={
                  jobProgress.current_round === 2
                    ? "Round 2: Peer debate and revising stances across voters..."
                    : "Round 1: Independent blind voting across all active model families..."
                }
              />

              {/* Live Voter Thinking Animation */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                {readyProviders.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                    }}
                  >
                    <RefreshCw size={13} className="animate-spin text-indigo-400" />
                    <span>{p.display_name} analyzing...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision Consensus Results */}
          {currentDecision && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <CouncilTallyPanel
                tally={currentDecision.final_tally}
                guardrailViolations={
                  currentDecision.guardrail_breach
                    ? [currentDecision.guardrail_breach.message || currentDecision.guardrail_breach.type || "Guardrail breached"]
                    : []
                }
                userVerdict={currentDecision.user_verdict}
                userModifications={currentDecision.user_modifications}
                hasSufficientData={currentDecision.financial_snapshot?.has_sufficient_data ?? true}
                dataNotice={currentDecision.financial_snapshot?.data_notice ?? null}
                retryingFailed={retryingFailed}
                onRetryFailed={handleRetryFailed}
                onUserDecision={handlePromptUserDecision}
              />

              {/* Round 1 Votes */}
              {(() => {
                const r1Votes = Object.values(currentDecision.round1_votes || {});
                if (r1Votes.length === 0) return null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
                      Round 1: Independent Blind Voting ({r1Votes.length} models)
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {r1Votes.map((v) => (
                        <CouncilVoteCard key={v.provider_name} vote={v} />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Round 2 Debate Stances */}
              {(() => {
                const r2Votes = currentDecision.round2_votes ? Object.values(currentDecision.round2_votes) : [];
                if (r2Votes.length === 0) return null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
                      Round 2: Peer Debate & Revised Stances ({r2Votes.length} models)
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {r2Votes.map((v) => (
                        <CouncilVoteCard key={`r2-${v.provider_name}`} vote={v} />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Right Sidebar: Deliberation History (Last 10) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="glass-panel" style={{ padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
              <History size={18} style={{ color: "var(--accent-primary)" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
                Past Deliberations
              </h3>
            </div>

            {history.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                No deliberations recorded yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setCurrentDecision(item);
                      navigate(`/council/${item.id}`);
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
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <Badge variant="brand" size="sm">
                        {item.decision_type.toUpperCase()}
                      </Badge>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.question}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connectivity & Latency Benchmark Modal */}
      <Modal
        isOpen={isTestAllOpen}
        onClose={() => setIsTestAllOpen(false)}
        title="Council Connectivity & Latency Benchmark"
        maxWidth="680px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Ping tests and response start times across all configured voter models:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto" }}>
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
                      gap: "6px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <strong style={{ fontSize: "13px" }}>{p.display_name}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {p.model_family} · <code>{p.model_id}</code>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {res ? (
                          <>
                            <Badge variant={res.status === "success" ? "success" : "danger"} size="sm">
                              {res.status}
                            </Badge>
                            {res.latency_ms > 0 && (
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                {res.latency_ms}ms
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Testing...</span>
                        )}
                      </div>
                    </div>

                    {res?.free_models && res.free_models.length > 0 && (
                      <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "6px", marginTop: "2px" }}>
                        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                          Available Free Models ({res.free_models.length} zero-price):
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {res.free_models.map((mId) => (
                            <button
                              key={mId}
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(mId);
                                toastSuccess(`Copied model ID: ${mId}`);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: "2px 6px", fontSize: "10px", minHeight: "22px" }}
                            >
                              <Copy size={10} />
                              <code>{mId}</code>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button type="button" variant="primary" onClick={() => setIsTestAllOpen(false)}>
              Close Benchmark
            </Button>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0", gap: "10px" }}>
            <RefreshCw size={24} className="animate-spin text-indigo-400" />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Computing deterministic ratios and scrubbing PII...
            </span>
          </div>
        ) : previewData ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Names, emails and account numbers are removed before anything reaches the AI models:
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
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button type="button" variant="primary" onClick={() => setIsPreviewOpen(false)}>
                Close Preview
              </Button>
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
        <form onSubmit={handleSaveUserDecision} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            The Council advises, but the final choice is always 100% yours. Record your stance:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
            <Button
              type="button"
              variant={decisionVerdictToSubmit === "accepted" ? "success" : "secondary"}
              size="sm"
              onClick={() => setDecisionVerdictToSubmit("accepted")}
            >
              Accept Council
            </Button>
            <Button
              type="button"
              variant={decisionVerdictToSubmit === "modified" ? "primary" : "secondary"}
              size="sm"
              onClick={() => setDecisionVerdictToSubmit("modified")}
            >
              Modify Plan
            </Button>
            <Button
              type="button"
              variant={decisionVerdictToSubmit === "rejected" ? "danger" : "secondary"}
              size="sm"
              onClick={() => setDecisionVerdictToSubmit("rejected")}
            >
              Reject Council
            </Button>
          </div>

          <div className="input-group">
            <label className="input-label">Notes or Modifications</label>
            <textarea
              rows={3}
              className="input-field"
              placeholder="e.g. Taking loan but negotiating lower rate or buying refurbished model..."
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
            <Button type="button" variant="secondary" onClick={() => setIsDecisionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Final Decision
            </Button>
          </div>
        </form>
      </Modal>

      {/* AI Models Manager Modal */}
      <Modal
        isOpen={isAIModelsOpen}
        onClose={() => {
          setIsAIModelsOpen(false);
          loadProvidersAndHistory();
        }}
        title="AI Models Manager (Free-Only Council)"
        maxWidth="960px"
      >
        <div style={{ maxHeight: "calc(85vh - 120px)", overflowY: "auto" }}>
          <AIModelsManager />
        </div>
      </Modal>
    </div>
  );
};
