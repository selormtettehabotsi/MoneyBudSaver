import React, { useState, useEffect } from "react";
import { councilApi } from "../api/council";
import { CouncilDecision, ProviderStatusItem } from "../types/council";
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
  const [currentDecision, setCurrentDecision] = useState<CouncilDecision | null>(null);

  // Providers Status
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [history, setHistory] = useState<CouncilDecision[]>([]);

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

    try {
      const res = await councilApi.ask({
        question: question.trim(),
        decision_type: decisionType,
        candidate_amount: candidateAmount ? candidateAmount : null,
        enable_debate: enableDebate,
        local_only_mode: localOnlyMode,
      });

      setCurrentDecision(res);
      loadProvidersAndHistory();
    } catch (err: any) {
      alert(err.message || "Council deliberation failed.");
    } finally {
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

  // Calculate active distinct model families for diversity check
  const readyProviders = providers.filter((p) => p.status === "ready" && p.is_configured);
  const distinctFamilies = Array.from(new Set(readyProviders.map((p) => p.model_family)));
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

        {/* Active Providers Badges */}
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          {providers.map((p) => {
            const isReady = p.status === "ready";
            const statusLabel = isReady
              ? "Ready"
              : p.status === "disabled_in_hosted"
              ? "Local Only"
              : "Not Configured";
            return (
              <span
                key={p.name}
                className={`badge ${isReady ? "badge-success" : "badge-secondary"}`}
                style={{
                  fontSize: "11px",
                  padding: "4px 8px",
                  opacity: isReady ? 1 : 0.75,
                }}
                title={`${p.display_name} • ${p.model_family} (${p.model_id}) - ${statusLabel}`}
              >
                <Cpu size={12} />
                <span>{p.display_name.split(" ")[0]}: {statusLabel}</span>
              </span>
            );
          })}
        </div>
      </div>

      <DisclaimerBanner />

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
              Model Family Diversity Warning ({distinctFamilies.length}/4 Families Active)
            </strong>
            <p style={{ margin: "4px 0 0 0", color: "var(--text-secondary)" }}>
              Fewer than 4 distinct AI model families are active (currently active:{" "}
              {distinctFamilies.length > 0 ? (
                <strong>{distinctFamilies.join(", ")}</strong>
              ) : (
                <em>None configured yet</em>
              )}
              ). To ensure robust, unbiased council deliberation, configure keys for <strong>Gemini</strong>, <strong>Groq (gpt-oss)</strong>, <strong>Mistral</strong>, and <strong>OpenRouter (Qwen)</strong> in your environment or Settings.
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

          {/* Loading Animation Placeholder */}
          {loading && (
            <div
              className="glass-panel flex flex-col items-center justify-center"
              style={{ padding: "40px 20px", gap: "14px" }}
            >
              <Scale size={36} className="text-indigo-400" style={{ animation: "pulseGlow 1.5s ease-in-out infinite" }} />
              <div style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "17px" }}>Council Members are Voting & Debating...</h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Feeding pre-computed financial ratios to models, evaluating risks, and debating consensus.
                </p>
              </div>
            </div>
          )}

          {/* Deliberation Results */}
          {currentDecision && !loading && (
            <div className="flex flex-col gap-6" style={{ width: "100%" }}>
              {/* Final Consensus Tally Panel */}
              <CouncilTallyPanel
                tally={currentDecision.final_tally}
                guardrailViolations={currentDecision.guardrail_breach?.guardrail_violations}
                userVerdict={currentDecision.user_verdict}
                userModifications={currentDecision.user_modifications}
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
                      onClick={() => handlePromptUserDecision("accepted")}
                      className="btn btn-sm btn-success flex items-center gap-1"
                      style={{ minHeight: "38px" }}
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
