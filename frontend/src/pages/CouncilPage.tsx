import React, { useState, useEffect } from "react";
import { councilApi } from "../api/council";
import { CouncilDecision, ProviderStatusItem } from "../types/council";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
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
} from "lucide-react";

export const CouncilPage: React.FC = () => {
  const { user } = useAuth();
  const { currency } = useCurrency();

  const isHosted = user?.is_hosted || false;

  // Form State
  const [question, setQuestion] = useState("");
  const [decisionType, setDecisionType] = useState<string>("borrow");
  const [candidateAmount, setCandidateAmount] = useState<string>("2000.00");
  const [enableDebate, setEnableDebate] = useState<boolean>(true);
  const [localOnlyMode, setLocalOnlyMode] = useState<boolean>(false);

  // Deliberation State
  const [loading, setLoading] = useState(false);
  const [currentDecision, setCurrentDecision] = useState<CouncilDecision | null>(null);
  const [activeTab, setActiveTab] = useState<"round1" | "round2">("round1");

  // Providers Status
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [history, setHistory] = useState<CouncilDecision[]>([]);

  // Decision Modal State
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionVerdictToSubmit, setDecisionVerdictToSubmit] = useState<"accepted" | "rejected" | "modified">("accepted");
  const [decisionNotes, setDecisionNotes] = useState("");

  const loadProvidersAndHistory = async () => {
    try {
      const [pList, hList] = await Promise.all([
        councilApi.getProviders(),
        councilApi.getHistory(10),
      ]);
      setProviders(pList);
      setHistory(hList);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProvidersAndHistory();
  }, []);

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
      if (res.round2_votes) {
        setActiveTab("round2");
      } else {
        setActiveTab("round1");
      }
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

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%" }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "26px" }}>The AI Financial Council</h1>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Multi-model debate, independent analysis, and confidence-weighted voting
          </span>
        </div>

        {/* Active Providers Badges */}
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          {providers.map((p) => {
            const isReady = p.status === "ready";
            return (
              <span
                key={p.name}
                className={`badge ${isReady ? "badge-success" : "badge-warning"}`}
                style={{ fontSize: "11px", padding: "3px 8px" }}
                title={`${p.model_family} (${p.model_id})`}
              >
                <Cpu size={12} />
                <span>{p.display_name.split(" ")[0]}</span>
              </span>
            );
          })}
        </div>
      </div>

      <DisclaimerBanner />

      {/* Main Deliberation Chamber Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Left 2 Cols: Question Form & Deliberation Output */}
        <div style={{ gridColumn: "span 2" }} className="flex flex-col gap-6">
          {/* Question Form */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "17px", marginBottom: "14px" }}>Submit a Decision to the Council</h3>

            {/* Quick Sample Presets */}
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginBottom: "16px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Quick Presets:</span>
              {sampleQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setQuestion(q.text);
                    setDecisionType(q.type);
                    setCandidateAmount(q.amount);
                  }}
                  style={{
                    background: "var(--bg-surface-solid)",
                    border: "1px solid var(--border-color)",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    fontSize: "11px",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {q.type.toUpperCase()}: {q.amount} {currency}
                </button>
              ))}
            </div>

            <form onSubmit={handleAskCouncil} className="flex flex-col gap-4">
              <div className="input-group">
                <label className="input-label">Your Financial Question or Dilemma</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Should I borrow GHS 2,000 at 18% APR for a new laptop?"
                  className="input-field"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="input-group">
                  <label className="input-label">Decision Type</label>
                  <select
                    className="input-field"
                    value={decisionType}
                    onChange={(e) => setDecisionType(e.target.value)}
                  >
                    <option value="borrow">Borrow / Loan Application</option>
                    <option value="purchase">Major Purchase / Expense</option>
                    <option value="investment">Investment / Savings Allocation</option>
                    <option value="budget_cut">Budget Reallocation / Cut</option>
                    <option value="general">General Financial Decision</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label">Proposed Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="input-field"
                    value={candidateAmount}
                    onChange={(e) => setCandidateAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Toggles: Debate mode & Local-only */}
              <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px", paddingTop: "8px" }}>
                <label className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={enableDebate}
                    onChange={(e) => setEnableDebate(e.target.checked)}
                    style={{ accentColor: "var(--accent-primary)", width: "16px", height: "16px" }}
                  />
                  <span>Enable Round 2 Debate (Models see peer summaries and revote)</span>
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
                    style={{ accentColor: "var(--accent-secondary)", width: "16px", height: "16px" }}
                  />
                  <span>Local-Only (Ollama) Mode</span>
                  {isHosted && <span style={{ fontSize: "11px", color: "var(--warning)" }}>(Disabled in Hosted Mode)</span>}
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ marginTop: "12px", width: "100%", padding: "12px" }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin text-white" style={{ animation: "spin 1s linear infinite" }} />
                    <span>Council is Deliberating (Round 1 & 2)...</span>
                  </>
                ) : (
                  <>
                    <Scale size={18} />
                    <span>Convene Council & Vote</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Loading Animation Placeholder */}
          {loading && (
            <div
              className="glass-panel flex flex-col items-center justify-center"
              style={{ padding: "48px 24px", gap: "14px" }}
            >
              <Scale size={36} className="text-indigo-400" style={{ animation: "pulseGlow 1.5s ease-in-out infinite" }} />
              <div style={{ textAlign: "center" }}>
                <h3 style={{ fontSize: "18px" }}>Council Members are Voting...</h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Feeding pre-computed financial ratios to models, evaluating risks, and debating consensus.
                </p>
              </div>
            </div>
          )}

          {/* Deliberation Results */}
          {currentDecision && !loading && (
            <div className="flex flex-col gap-6">
              {/* Final Consensus Tally Panel */}
              <CouncilTallyPanel
                tally={currentDecision.final_tally}
                guardrailViolations={currentDecision.guardrail_breach?.guardrail_violations}
                userVerdict={currentDecision.user_verdict}
                userModifications={currentDecision.user_modifications}
                onUserDecision={handlePromptUserDecision}
              />

              {/* Round Switcher Tabs */}
              {currentDecision.round2_votes && (
                <div className="flex items-center gap-2">
                  <button
                    className={`btn btn-sm ${activeTab === "round2" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setActiveTab("round2")}
                  >
                    <Sparkles size={14} />
                    <span>Round 2 (Post-Debate Consensus)</span>
                  </button>

                  <button
                    className={`btn btn-sm ${activeTab === "round1" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setActiveTab("round1")}
                  >
                    <span>Round 1 (Blind Independent Votes)</span>
                  </button>
                </div>
              )}

              {/* Individual Model Cards Grid */}
              <div className="grid grid-cols-2 gap-4">
                {Object.values(
                  activeTab === "round2" && currentDecision.round2_votes
                    ? currentDecision.round2_votes
                    : currentDecision.round1_votes
                ).map((vote: any, index: number) => (
                  <CouncilVoteCard key={index} vote={vote} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Deliberation History */}
        <div className="flex flex-col gap-4">
          <div className="glass-panel" style={{ padding: "20px" }}>
            <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
              <History size={18} style={{ color: "var(--accent-secondary)" }} />
              <h3 style={{ fontSize: "16px" }}>Past Inquiries</h3>
            </div>

            {history.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                No previous council inquiries recorded.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((item) => {
                  const isApp = item.final_tally.final_verdict.includes("approve");
                  const isRej = item.final_tally.final_verdict === "reject";

                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setCurrentDecision(item);
                        setActiveTab(item.round2_votes ? "round2" : "round1");
                      }}
                      style={{
                        padding: "12px 14px",
                        background: currentDecision?.id === item.id ? "var(--bg-surface-hover)" : "var(--bg-surface-solid)",
                        borderRadius: "var(--radius-md)",
                        border: currentDecision?.id === item.id ? "1px solid var(--accent-primary)" : "1px solid var(--border-color)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ marginBottom: "4px" }}>
                        <span className={`badge ${isApp ? "badge-success" : isRej ? "badge-danger" : "badge-warning"}`} style={{ fontSize: "10px" }}>
                          {item.final_tally.final_verdict.toUpperCase()}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <p style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {item.question}
                      </p>

                      {item.user_verdict && (
                        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--accent-secondary)" }}>
                          You chose: <strong>{item.user_verdict.toUpperCase()}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* User Decision Modal */}
      <Modal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
        title="Record Your Final Decision"
      >
        <form onSubmit={handleSaveUserDecision} className="flex flex-col gap-4">
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Selected Verdict:{" "}
            <strong style={{ color: decisionVerdictToSubmit === "accepted" ? "var(--success)" : decisionVerdictToSubmit === "rejected" ? "var(--danger)" : "var(--accent-primary)" }}>
              {decisionVerdictToSubmit.toUpperCase()}
            </strong>
          </p>

          <div className="input-group">
            <label className="input-label">Notes & Conditions (Optional)</label>
            <textarea
              rows={3}
              placeholder="e.g. Proceeded after getting 10% cash discount from vendor..."
              className="input-field"
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "10px" }}>
            Confirm & Save to Record
          </button>
        </form>
      </Modal>
    </div>
  );
};
