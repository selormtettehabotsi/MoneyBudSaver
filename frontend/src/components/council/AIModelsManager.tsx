import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Zap,
  Cpu,
  Globe,
  Server,
  Shield,
  Check,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  Wrench,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Search,
  Timer,
  Plus,
  Trash2,
  ListOrdered,
  X,
} from "lucide-react";
import { councilApi } from "../../api/council";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmDialogContext";
import {
  ProviderStatusItem,
  TestConnectionResponse,
  RecommendedModelItem,
  FindWorkingModelCandidateResult,
  FixAllResponse,
  ModelSwitchLogOut,
} from "../../types/council";

interface AIModelsManagerProps {
  onClose?: () => void;
}

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fallback below
  }
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    return successful;
  } catch (e) {
    return false;
  }
};

export const AIModelsManager: React.FC<AIModelsManagerProps> = ({ onClose }) => {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [providers, setProviders] = useState<ProviderStatusItem[]>([]);
  const [recommendedMap, setRecommendedMap] = useState<Record<string, RecommendedModelItem[]>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState<boolean>(true);
  const [autoSwitchLoading, setAutoSwitchLoading] = useState<boolean>(false);

  // Test & Probe State
  const [testLoading, setTestLoading] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestConnectionResponse>>({});

  // Use Recommended State
  const [useRecLoading, setUseRecLoading] = useState<Record<string, boolean>>({});
  const [useRecResults, setUseRecResults] = useState<Record<string, { success: boolean; message: string; attempts: FindWorkingModelCandidateResult[] }>>({});

  // Fix All State
  const [fixAllLoading, setFixAllLoading] = useState<boolean>(false);
  const [fixAllResult, setFixAllResult] = useState<FixAllResponse | null>(null);

  // Paste / Custom Model Input State
  const [pastedModelInputs, setPastedModelInputs] = useState<Record<string, string>>({});
  const [confirmedFreeCheck, setConfirmedFreeCheck] = useState<Record<string, boolean>>({});
  const [pasteSaving, setPasteSaving] = useState<Record<string, boolean>>({});
  const [pasteError, setPasteError] = useState<Record<string, string | null>>({});

  // Collapsible Advanced Settings (Sampling, Base URL, etc.)
  const [expandedSettings, setExpandedSettings] = useState<Record<string, boolean>>({});
  const [samplingDrafts, setSamplingDrafts] = useState<Record<string, {
    temperature: number;
    top_p: number;
    max_tokens: number;
    base_url?: string;
    env_key_name?: string;
    exclude_slow_round2?: boolean;
  }>>({});
  const [samplingSaving, setSamplingSaving] = useState<Record<string, boolean>>({});

  // Choose Model Bottom Sheet State
  const [activeBottomSheetProvider, setActiveBottomSheetProvider] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState<string>("");
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogCandidates, setCatalogCandidates] = useState<FindWorkingModelCandidateResult[]>([]);
  const [catalogFreeModels, setCatalogFreeModels] = useState<string[]>([]);

  // Switch Logs Modal State
  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);
  const [switchLogs, setSwitchLogs] = useState<ModelSwitchLogOut[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);

  // Edit Recommended List Modal State
  const [isEditRecOpen, setIsEditRecOpen] = useState<boolean>(false);
  const [recEditProvider, setRecEditProvider] = useState<string>("gemini");
  const [recEditList, setRecEditList] = useState<string[]>([]);
  const [newRecInput, setNewRecInput] = useState<string>("");
  const [recSaving, setRecSaving] = useState<boolean>(false);

  // Copied indicator feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [provList, recMap, autoSw] = await Promise.all([
        councilApi.getProviders(),
        councilApi.getRecommended().catch(() => ({})),
        councilApi.getAutoSwitch().catch(() => ({ setting_value: true })),
      ]);
      setProviders(provList);
      setRecommendedMap(recMap);
      setAutoSwitchEnabled(Boolean(autoSw?.setting_value ?? true));

      // Populate sampling drafts
      const drafts: Record<string, any> = {};
      provList.forEach((p) => {
        drafts[p.name] = {
          temperature: p.temperature ?? 0.5,
          top_p: p.top_p ?? 0.95,
          max_tokens: p.max_tokens ?? 4096,
          base_url: p.base_url || "",
          env_key_name: p.env_key_name || "",
          exclude_slow_round2: p.exclude_slow_round2 ?? false,
        };
      });
      setSamplingDrafts(drafts);
    } catch (err: any) {
      console.error("Failed to load council provider settings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopy = async (text: string, idKey: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(idKey);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleToggleAutoSwitch = async (enabled: boolean) => {
    setAutoSwitchLoading(true);
    try {
      await councilApi.updateAutoSwitch(enabled);
      setAutoSwitchEnabled(enabled);
      toast.success(enabled ? "Auto-switch enabled" : "Auto-switch disabled");
    } catch (err: any) {
      toast.error(err.message || "Failed to update auto-switch setting.");
    } finally {
      setAutoSwitchLoading(false);
    }
  };

  const handleTestProvider = async (providerName: string, modelId?: string) => {
    setTestLoading((prev) => ({ ...prev, [providerName]: true }));
    try {
      const res = await councilApi.testConnection(providerName, modelId);
      setTestResults((prev) => ({ ...prev, [providerName]: res }));
      // Refresh providers to show updated median TTFT and status
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      if (res.status === "success") {
        toast.success(`${providerName} passed test probe (${res.latency_ms}ms)`);
      } else {
        toast.warning(`${providerName}: ${res.diagnosis || res.status}`);
      }
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || (err?.message && err.message.toLowerCase().includes("rate limit"));
      setTestResults((prev) => ({
        ...prev,
        [providerName]: {
          provider_name: providerName,
          model_id: modelId || "unknown",
          http_status: isRateLimit ? 429 : null,
          latency_ms: 0,
          status: isRateLimit ? "rate_limited" : "error",
          diagnosis: err.message || "Connection test probe failed.",
          available_models_count: 0,
          close_matches: [],
        },
      }));
      toast.error(`${providerName} probe failed: ${err.message || "Error"}`);
    } finally {
      setTestLoading((prev) => ({ ...prev, [providerName]: false }));
    }
  };

  const handleUseRecommended = async (providerName: string) => {
    setUseRecLoading((prev) => ({ ...prev, [providerName]: true }));
    setUseRecResults((prev) => {
      const next = { ...prev };
      delete next[providerName];
      return next;
    });

    try {
      const res = await councilApi.useRecommended(providerName);
      setUseRecResults((prev) => ({
        ...prev,
        [providerName]: {
          success: res.success,
          message: res.message,
          attempts: res.attempts || [],
        },
      }));
      // Refresh list
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.warning(res.message);
      }
    } catch (err: any) {
      setUseRecResults((prev) => ({
        ...prev,
        [providerName]: {
          success: false,
          message: err.message || "Failed to test recommended models.",
          attempts: [],
        },
      }));
      toast.error(err.message || "Failed to test recommended models.");
    } finally {
      setUseRecLoading((prev) => ({ ...prev, [providerName]: false }));
    }
  };

  const handleFixAll = async () => {
    setFixAllLoading(true);
    setFixAllResult(null);
    try {
      const res = await councilApi.fixAll();
      setFixAllResult(res);
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      toast.success(res.summary || "Fix All completed successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to fix council providers.");
    } finally {
      setFixAllLoading(false);
    }
  };

  const handleSavePastedModel = async (providerName: string) => {
    const targetModel = (pastedModelInputs[providerName] || "").trim();
    if (!targetModel) {
      setPasteError((prev) => ({ ...prev, [providerName]: "Please enter a model ID." }));
      return;
    }

    setPasteSaving((prev) => ({ ...prev, [providerName]: true }));
    setPasteError((prev) => ({ ...prev, [providerName]: null }));

    try {
      await councilApi.updateModel(providerName, {
        model_id: targetModel,
        confirmed_free: Boolean(confirmedFreeCheck[providerName]),
      });
      // Clear input on success
      setPastedModelInputs((prev) => ({ ...prev, [providerName]: "" }));
      setConfirmedFreeCheck((prev) => ({ ...prev, [providerName]: false }));
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      toast.success(`Updated ${providerName} model to ${targetModel}`);
    } catch (err: any) {
      const msg = err.message || "Failed to validate and save model.";
      setPasteError((prev) => ({ ...prev, [providerName]: msg }));
      toast.error(msg);
    } finally {
      setPasteSaving((prev) => ({ ...prev, [providerName]: false }));
    }
  };

  const handleRevertModel = async (providerName: string, targetModelId: string) => {
    const ok = await confirm({
      title: "Revert Model?",
      message: `Revert ${providerName} to previous model '${targetModelId}'?`,
      confirmText: "Revert Model",
      cancelText: "Cancel",
    });
    if (!ok) return;

    try {
      await councilApi.revertModel(providerName, targetModelId);
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      toast.success(`Reverted ${providerName} to ${targetModelId}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to revert model.");
    }
  };

  const handleToggleCouncilUsage = async (providerName: string, enabled: boolean) => {
    try {
      await councilApi.updateModel(providerName, {
        model_id: providers.find((p) => p.name === providerName)?.model_id || "",
        enabled,
        force_skip_test: true,
      });
      setProviders((prev) =>
        prev.map((p) => (p.name === providerName ? { ...p, enabled_in_council: enabled } : p))
      );
      toast.info(`${providerName} council voting ${enabled ? "enabled" : "disabled"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update council toggle.");
    }
  };

  const handleSaveSampling = async (providerName: string) => {
    const draft = samplingDrafts[providerName];
    if (!draft) return;
    setSamplingSaving((prev) => ({ ...prev, [providerName]: true }));
    try {
      const current = providers.find((p) => p.name === providerName);
      await councilApi.updateModel(providerName, {
        model_id: current?.model_id || "",
        temperature: draft.temperature,
        top_p: draft.top_p,
        max_tokens: draft.max_tokens,
        base_url: draft.base_url || undefined,
        env_key_name: draft.env_key_name || undefined,
        exclude_slow_round2: draft.exclude_slow_round2,
        force_skip_test: true,
      });
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      setExpandedSettings((prev) => ({ ...prev, [providerName]: false }));
      toast.success(`Saved sampling settings for ${providerName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save sampling parameters.");
    } finally {
      setSamplingSaving((prev) => ({ ...prev, [providerName]: false }));
    }
  };

  // Open Choose Model Bottom Sheet
  const handleOpenBottomSheet = async (providerName: string) => {
    setActiveBottomSheetProvider(providerName);
    setCatalogSearch("");
    setCatalogLoading(true);
    setCatalogCandidates([]);
    setCatalogFreeModels([]);

    try {
      // 1. Fetch live catalog candidates & test results
      const [findRes, connRes] = await Promise.all([
        councilApi.findWorking(providerName).catch(() => ({ tested_candidates: [] })),
        councilApi.testConnection(providerName).catch(() => null),
      ]);
      setCatalogCandidates(findRes.tested_candidates || []);
      if (connRes && connRes.free_models) {
        setCatalogFreeModels(connRes.free_models);
      }
    } catch (err: any) {
      console.error("Failed to load catalog candidates:", err);
    } finally {
      setCatalogLoading(false);
    }
  };

  const handleSelectModelFromSheet = async (providerName: string, selectedModelId: string) => {
    try {
      await councilApi.updateModel(providerName, {
        model_id: selectedModelId,
        confirmed_free: true,
      });
      setActiveBottomSheetProvider(null);
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      toast.success(`Selected model ${selectedModelId} for ${providerName}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply selected model.");
    }
  };

  // Open Switch Logs
  const handleOpenSwitchLogs = async () => {
    setIsLogsOpen(true);
    setLogsLoading(true);
    try {
      const logs = await councilApi.getSwitchLogs();
      setSwitchLogs(logs);
    } catch (err: any) {
      toast.error(err.message || "Failed to load switch logs.");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRevertLog = async (logId: string) => {
    try {
      await councilApi.revertSwitchLog(logId);
      const logs = await councilApi.getSwitchLogs();
      setSwitchLogs(logs);
      const updatedList = await councilApi.getProviders();
      setProviders(updatedList);
      toast.success("Reverted model switch successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to revert switch log.");
    }
  };

  // Open Recommended Editor
  const handleOpenEditRec = (providerName: string) => {
    setRecEditProvider(providerName);
    const recs = (recommendedMap[providerName] || []).map((r) => r.pattern || r.model_id);
    setRecEditList(recs);
    setNewRecInput("");
    setIsEditRecOpen(true);
  };

  const handleSaveEditRec = async () => {
    setRecSaving(true);
    try {
      await councilApi.updateRecommended(recEditProvider, recEditList);
      const updatedRecMap = await councilApi.getRecommended();
      setRecommendedMap(updatedRecMap);
      setIsEditRecOpen(false);
      toast.success("Updated recommended models list");
    } catch (err: any) {
      toast.error(err.message || "Failed to save recommended models list.");
    } finally {
      setRecSaving(false);
    }
  };

  const getProviderIcon = (name: string) => {
    if (name.startsWith("gemini")) return <Sparkles size={18} />;
    if (name.startsWith("groq")) return <Zap size={18} />;
    if (name.startsWith("openrouter")) return <Globe size={18} />;
    if (name.startsWith("nvidia")) return <Cpu size={18} />;
    if (name.startsWith("custom")) return <Shield size={18} />;
    return <Server size={18} />;
  };

  const getStatusBadge = (p: ProviderStatusItem) => {
    if (p.is_local && p.status === "disabled_in_hosted") {
      return <span className="badge badge-secondary">Disabled in Hosted Mode</span>;
    }
    if (!p.has_key) {
      return <span className="badge badge-danger">API Key Missing in Env</span>;
    }
    if (!p.model_id) {
      return <span className="badge badge-warning">No Model Configured</span>;
    }
    if (p.circuit_breaker_tripped) {
      return <span className="badge badge-warning">Skipped (Circuit Breaker)</span>;
    }
    if (p.status === "working") {
      return (
        <span className="badge badge-success flex items-center gap-1">
          <CheckCircle2 size={12} />
          <span>Working</span>
        </span>
      );
    }
    if (p.status === "failed") {
      return (
        <span className="badge badge-danger flex items-center gap-1">
          <XCircle size={12} />
          <span>Test Failed</span>
        </span>
      );
    }
    if (p.status === "slow" || p.is_slow) {
      return (
        <span className="badge badge-warning flex items-center gap-1">
          <Timer size={12} />
          <span>Slow (&gt;30s)</span>
        </span>
      );
    }
    return <span className="badge badge-info">Ready</span>;
  };

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%", maxWidth: "980px" }}>
      {/* Top Banner & Header */}
      <div className="glass-panel" style={{ padding: "20px 24px" }}>
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "14px" }}>
          <div>
            <div className="flex items-center gap-2.5">
              <Cpu size={22} style={{ color: "var(--accent-primary)" }} />
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>AI Models & Council Voters</h2>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Configure models, test probes, sampling parameters, and fallbacks directly in the website. Zero Render edits required.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2.5" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={fixAllLoading}
              onClick={handleFixAll}
              className="btn btn-primary flex items-center gap-2"
              style={{ minHeight: "44px", padding: "8px 16px" }}
              title="Automatically test and apply passing recommended models for any broken voters"
            >
              {fixAllLoading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Wrench size={16} />
              )}
              <span>{fixAllLoading ? "Fixing All..." : "Fix All"}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenSwitchLogs}
              className="btn btn-secondary flex items-center gap-1.5"
              style={{ minHeight: "44px", padding: "8px 14px", fontSize: "13px" }}
              title="View audit trail of auto-switched models"
            >
              <ListOrdered size={16} />
              <span>Switch Logs</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="btn btn-ghost"
                style={{ minHeight: "44px", padding: "8px 12px" }}
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Global Auto-Switch Toggle */}
        <div
          style={{
            marginTop: "16px",
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <label className="flex items-center gap-2.5" style={{ cursor: "pointer", fontSize: "13px" }}>
            <input
              type="checkbox"
              disabled={autoSwitchLoading}
              checked={autoSwitchEnabled}
              onChange={(e) => handleToggleAutoSwitch(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            <div>
              <strong style={{ color: "var(--text-primary)" }}>Auto-switch when a model disappears</strong>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                If a model returns 404 during deliberation, automatically switch to the next passing confirmed-free recommended model.
              </div>
            </div>
          </label>

          <span className="badge badge-success" style={{ fontSize: "11px" }}>
            {autoSwitchEnabled ? "Auto-Switch Enabled" : "Manual Only"}
          </span>
        </div>
      </div>

      {/* Fix All Summary Modal / Alert */}
      {fixAllResult && (
        <div
          className="glass-panel"
          style={{
            padding: "16px 20px",
            border: "1px solid var(--accent-primary)",
            background: "rgba(99, 102, 241, 0.06)",
          }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: "10px" }}>
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>{fixAllResult.summary}</span>
            </div>
            <button
              type="button"
              onClick={() => setFixAllResult(null)}
              className="btn btn-ghost btn-sm"
              style={{ padding: "4px 8px" }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex flex-col gap-2" style={{ fontSize: "12px" }}>
            {fixAllResult.details.map((d) => (
              <div
                key={d.provider_key}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-color)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <div className="flex items-center gap-2">
                  <strong style={{ textTransform: "capitalize" }}>{d.provider_key.replace("_", " ")}:</strong>
                  <span>{d.message}</span>
                </div>
                {d.new_model_id && (
                  <code style={{ fontSize: "11px" }}>{d.new_model_id}</code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="glass-panel flex items-center justify-center" style={{ padding: "48px" }}>
          <RefreshCw size={24} className="animate-spin text-indigo-400" />
          <span style={{ marginLeft: "10px" }}>Loading AI Council voters...</span>
        </div>
      )}

      {/* Voter Cards List */}
      {!loading && (
        <div className="flex flex-col gap-5">
          {providers.map((p) => {
            const isLocalDisabled = p.is_local && p.status === "disabled_in_hosted";
            const isProbeLoading = testLoading[p.name] || false;
            const isRecLoading = useRecLoading[p.name] || false;
            const probeRes = testResults[p.name];
            const useRecRes = useRecResults[p.name];
            const isExpanded = expandedSettings[p.name] || false;
            const draft = samplingDrafts[p.name] || {
              temperature: p.temperature ?? 0.5,
              top_p: p.top_p ?? 0.95,
              max_tokens: p.max_tokens ?? 4096,
              base_url: p.base_url || "",
              env_key_name: p.env_key_name || "",
              exclude_slow_round2: p.exclude_slow_round2 ?? false,
            };

            const recsForProvider = (recommendedMap[p.name] || []).map((r) => r.model_id);
            const isReasoning = p.model_id.toLowerCase().includes("r1") || p.model_id.toLowerCase().includes("qwq") || p.model_id.toLowerCase().includes("reason");

            return (
              <div
                key={p.name}
                className="glass-panel"
                style={{
                  padding: "20px 24px",
                  borderRadius: "var(--radius-lg)",
                  opacity: isLocalDisabled ? 0.6 : 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px" }}>
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "var(--radius-md)",
                        background: "var(--bg-surface-raised)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent-primary)",
                        flexShrink: 0,
                      }}
                    >
                      {getProviderIcon(p.name)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 style={{ fontSize: "16px", fontWeight: 700 }}>{p.display_name}</h3>
                        <span className="badge badge-secondary" style={{ fontSize: "11px" }}>
                          {p.model_family}
                        </span>
                        {getStatusBadge(p)}
                        {p.confirmed_free && (
                          <span className="badge badge-success" style={{ fontSize: "10px" }}>
                            Free Confirmed
                          </span>
                        )}
                        {isReasoning && (
                          <span className="badge badge-info" style={{ fontSize: "10px" }}>
                            Reasoning Model
                          </span>
                        )}
                      </div>

                      {p.shares_key_with && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          Shares API Key rate limits with <strong>{p.shares_key_with}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Right Toggle & TTFT */}
                  <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
                    {p.median_ttft_ms !== null && p.median_ttft_ms !== undefined && p.median_ttft_ms > 0 && (
                      <span
                        className="badge badge-secondary flex items-center gap-1"
                        style={{ fontSize: "11px", padding: "4px 8px" }}
                        title="Median Time to First Token"
                      >
                        <Timer size={12} />
                        <span>TTFT: <strong>{p.median_ttft_ms}ms</strong></span>
                      </span>
                    )}

                    {!isLocalDisabled && (
                      <label className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: "13px", minHeight: "44px" }}>
                        <input
                          type="checkbox"
                          checked={p.enabled_in_council}
                          onChange={(e) => handleToggleCouncilUsage(p.name, e.target.checked)}
                          style={{ width: "18px", height: "18px" }}
                        />
                        <span style={{ fontWeight: 600, color: p.enabled_in_council ? "var(--text-primary)" : "var(--text-muted)" }}>
                          Use in Council
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Model ID & Badges Row */}
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-surface-solid)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "8px" }}>
                    <div className="flex items-center gap-2" style={{ flex: 1, minWidth: "240px", wordBreak: "break-all" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Active Model:</span>
                      <code style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-primary)" }}>
                        {p.model_id || "None (choose model)"}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      {p.model_id && (
                        <button
                          type="button"
                          onClick={() => handleCopy(p.model_id, `${p.name}-active`)}
                          className="btn btn-secondary btn-sm flex items-center gap-1"
                          style={{ minHeight: "36px", padding: "4px 10px", fontSize: "11px" }}
                          title="Copy active model ID"
                        >
                          {copiedKey === `${p.name}-active` ? (
                            <>
                              <Check size={12} className="text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              <span>Copy ID</span>
                            </>
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isLocalDisabled || isProbeLoading}
                        onClick={() => handleTestProvider(p.name, p.model_id)}
                        className="btn btn-secondary btn-sm flex items-center gap-1.5"
                        style={{ minHeight: "36px", padding: "4px 12px", fontSize: "12px" }}
                        title="Run single connectivity probe"
                      >
                        {isProbeLoading ? (
                          <>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Testing...</span>
                          </>
                        ) : (
                          <>
                            <Cpu size={13} />
                            <span>Test</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {p.fallback_model_id && (
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Fallback: <code>{p.fallback_model_id}</code>
                    </div>
                  )}

                  {/* Previous 5 History Pills (One-Tap Revert) */}
                  {p.history && p.history.length > 0 && (
                    <div className="flex items-center gap-1.5" style={{ flexWrap: "wrap", marginTop: "4px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "2px" }}>
                        <RotateCcw size={10} />
                        <span>Revert:</span>
                      </span>
                      {p.history.map((histMid) => (
                        <button
                          key={histMid}
                          type="button"
                          onClick={() => handleRevertModel(p.name, histMid)}
                          className="btn btn-ghost btn-sm"
                          style={{
                            padding: "2px 6px",
                            fontSize: "10px",
                            minHeight: "26px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px dashed var(--border-color)",
                          }}
                          title={`Click to revert to ${histMid}`}
                        >
                          <code>{histMid}</code>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Primary Card Actions: Use Recommended, Choose Model, Paste Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Action A: Use Recommended */}
                  <button
                    type="button"
                    disabled={isLocalDisabled || isRecLoading}
                    onClick={() => handleUseRecommended(p.name)}
                    className="btn btn-secondary flex items-center justify-center gap-2"
                    style={{ minHeight: "44px", fontSize: "13px" }}
                  >
                    {isRecLoading ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Testing Recommended...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} style={{ color: "var(--accent-secondary)" }} />
                        <span>Use Recommended</span>
                      </>
                    )}
                  </button>

                  {/* Action B: Choose Model (Bottom Sheet) */}
                  <button
                    type="button"
                    disabled={isLocalDisabled}
                    onClick={() => handleOpenBottomSheet(p.name)}
                    className="btn btn-secondary flex items-center justify-center gap-2"
                    style={{ minHeight: "44px", fontSize: "13px" }}
                  >
                    <Search size={14} />
                    <span>Choose Model...</span>
                  </button>
                </div>

                {/* Action C: Paste Model ID Form */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                    <input
                      type="text"
                      placeholder="Paste or type any Model ID (e.g. meta/muse-glimmer-30b)"
                      className="input-field"
                      style={{ flex: 1, minWidth: "200px", minHeight: "44px", fontSize: "12px" }}
                      value={pastedModelInputs[p.name] || ""}
                      onChange={(e) => setPastedModelInputs((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    />

                    <button
                      type="button"
                      disabled={isLocalDisabled || pasteSaving[p.name] || !pastedModelInputs[p.name]?.trim()}
                      onClick={() => handleSavePastedModel(p.name)}
                      className="btn btn-primary flex items-center gap-1.5"
                      style={{ minHeight: "44px", padding: "8px 16px", fontSize: "12px" }}
                    >
                      {pasteSaving[p.name] ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Testing & Saving...</span>
                        </>
                      ) : (
                        <>
                          <Check size={13} />
                          <span>Apply Model</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Confirmed Free Checkbox (Required for models outside recommended) */}
                  <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(confirmedFreeCheck[p.name])}
                      onChange={(e) => setConfirmedFreeCheck((prev) => ({ ...prev, [p.name]: e.target.checked }))}
                      style={{ width: "16px", height: "16px" }}
                    />
                    <span>I confirmed this is a free endpoint (required for models outside recommended list)</span>
                  </label>

                  {pasteError[p.name] && (
                    <div className="badge-danger flex items-center gap-1.5" style={{ padding: "6px 10px", borderRadius: "var(--radius-xs)", fontSize: "11px" }}>
                      <AlertCircle size={12} />
                      <span>{pasteError[p.name]}</span>
                    </div>
                  )}
                </div>

                {/* Live Diagnostic Probe Output Card */}
                {probeRes && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: probeRes.status === "success" ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)",
                      border: probeRes.status === "success" ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(244, 63, 94, 0.25)",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "6px" }}>
                      <div className="flex items-center gap-2">
                        <span className={`badge ${probeRes.status === "success" ? "badge-success" : "badge-danger"}`} style={{ fontSize: "10px" }}>
                          {probeRes.status.toUpperCase()}
                        </span>
                        {probeRes.http_status && (
                          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>HTTP {probeRes.http_status}</span>
                        )}
                        {probeRes.catalog_ok !== undefined && (
                          <span className="badge badge-secondary" style={{ fontSize: "10px" }}>
                            Catalog: {probeRes.catalog_ok ? "Found" : "Missing"}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {probeRes.ttft_ms !== null && probeRes.ttft_ms !== undefined && (
                          <span>TTFT: <strong>{probeRes.ttft_ms}ms</strong></span>
                        )}
                        {probeRes.latency_ms > 0 && <span>Total: <strong>{probeRes.latency_ms}ms</strong></span>}
                      </div>
                    </div>

                    <div style={{ color: "var(--text-primary)" }}>{probeRes.diagnosis}</div>
                  </div>
                )}

                {/* Use Recommended Attempts Diagnostic Card */}
                {useRecRes && (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: useRecRes.success ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)",
                      border: useRecRes.success ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid rgba(244, 63, 94, 0.25)",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {useRecRes.success ? <CheckCircle2 size={16} className="text-emerald-400" /> : <XCircle size={16} className="text-rose-400" />}
                      <span>{useRecRes.message}</span>
                    </div>

                    {useRecRes.attempts && useRecRes.attempts.length > 0 && (
                      <div className="flex flex-col gap-1.5" style={{ marginTop: "4px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Sequential Probe Attempts:</span>
                        {useRecRes.attempts.map((att, idx) => (
                          <div
                            key={idx}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "var(--radius-xs)",
                              background: "var(--bg-surface)",
                              fontSize: "11px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <code>{att.model_id}</code>
                            <span className={`badge ${att.status === "passed" ? "badge-success" : "badge-danger"}`} style={{ fontSize: "9px" }}>
                              {att.status} ({att.latency_ms}ms)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsible Sampling Parameters & Custom Slot Settings */}
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setExpandedSettings((prev) => ({ ...prev, [p.name]: !isExpanded }))}
                    className="btn btn-ghost btn-sm flex items-center justify-between"
                    style={{ width: "100%", padding: "6px 0", fontSize: "12px", color: "var(--text-secondary)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Sliders size={14} />
                      <span>Advanced Sampling & Provider Settings</span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-4" style={{ marginTop: "12px" }}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="input-group">
                          <label className="input-label" style={{ fontSize: "11px" }}>Temperature (Default: 0.5)</label>
                          <input
                            type="number"
                            step="0.05"
                            min="0.0"
                            max="2.0"
                            className="input-field"
                            style={{ minHeight: "40px", fontSize: "12px" }}
                            value={draft.temperature}
                            onChange={(e) =>
                              setSamplingDrafts((prev) => ({
                                ...prev,
                                [p.name]: { ...draft, temperature: parseFloat(e.target.value) || 0.5 },
                              }))
                            }
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label" style={{ fontSize: "11px" }}>Top P (Default: 0.95)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.0"
                            max="1.0"
                            className="input-field"
                            style={{ minHeight: "40px", fontSize: "12px" }}
                            value={draft.top_p}
                            onChange={(e) =>
                              setSamplingDrafts((prev) => ({
                                ...prev,
                                [p.name]: { ...draft, top_p: parseFloat(e.target.value) || 0.95 },
                              }))
                            }
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label" style={{ fontSize: "11px" }}>Max Tokens (Default: 4096 / 8192)</label>
                          <input
                            type="number"
                            step="256"
                            min="512"
                            max="32768"
                            className="input-field"
                            style={{ minHeight: "40px", fontSize: "12px" }}
                            value={draft.max_tokens}
                            onChange={(e) =>
                              setSamplingDrafts((prev) => ({
                                ...prev,
                                [p.name]: { ...draft, max_tokens: parseInt(e.target.value) || 4096 },
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* Custom Slot Extra Fields */}
                      {p.name.startsWith("custom") && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="input-group">
                            <label className="input-label" style={{ fontSize: "11px" }}>Base URL (HTTPS only, SSRF protected)</label>
                            <input
                              type="text"
                              placeholder="https://your-custom-endpoint.com/v1"
                              className="input-field"
                              style={{ minHeight: "40px", fontSize: "12px" }}
                              value={draft.base_url || ""}
                              onChange={(e) =>
                                setSamplingDrafts((prev) => ({
                                  ...prev,
                                  [p.name]: { ...draft, base_url: e.target.value },
                                }))
                              }
                            />
                          </div>

                          <div className="input-group">
                            <label className="input-label" style={{ fontSize: "11px" }}>Env Var Name for API Key (e.g. CUSTOM_API_KEY)</label>
                            <input
                              type="text"
                              placeholder="CUSTOM_API_KEY"
                              className="input-field"
                              style={{ minHeight: "40px", fontSize: "12px" }}
                              value={draft.env_key_name || ""}
                              onChange={(e) =>
                                setSamplingDrafts((prev) => ({
                                  ...prev,
                                  [p.name]: { ...draft, env_key_name: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Exclude from Round 2 Debate Toggle */}
                      <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(draft.exclude_slow_round2)}
                          onChange={(e) =>
                            setSamplingDrafts((prev) => ({
                              ...prev,
                              [p.name]: { ...draft, exclude_slow_round2: e.target.checked },
                            }))
                          }
                          style={{ width: "16px", height: "16px" }}
                        />
                        <span>Exclude from Round 2 Debate (Recommended for slow voters &gt;30s TTFT to optimize council speed)</span>
                      </label>

                      <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditRec(p.name)}
                          className="btn btn-ghost btn-sm flex items-center gap-1.5"
                          style={{ fontSize: "12px", color: "var(--accent-primary)" }}
                        >
                          <ListOrdered size={14} />
                          <span>Edit Recommended List ({recsForProvider.length})</span>
                        </button>

                        <button
                          type="button"
                          disabled={samplingSaving[p.name]}
                          onClick={() => handleSaveSampling(p.name)}
                          className="btn btn-primary btn-sm flex items-center gap-1.5"
                          style={{ minHeight: "36px", padding: "6px 14px", fontSize: "12px" }}
                        >
                          {samplingSaving[p.name] ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          <span>Save Settings</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Choose Model Bottom Sheet */}
      {activeBottomSheetProvider && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
          }}
          onClick={() => setActiveBottomSheetProvider(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "680px",
              maxHeight: "85vh",
              background: "var(--bg-surface)",
              borderTopLeftRadius: "var(--radius-xl)",
              borderTopRightRadius: "var(--radius-xl)",
              border: "1px solid var(--border-color)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 style={{ fontSize: "17px", fontWeight: 700 }}>
                  Choose Model for {activeBottomSheetProvider.toUpperCase()}
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  Filtered to chat-capable models • Recommended models at top
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveBottomSheetProvider(null)}
                className="btn btn-ghost btn-sm"
                style={{ padding: "6px" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search models by name or family..."
                className="input-field"
                style={{ paddingLeft: "36px", minHeight: "44px", fontSize: "13px" }}
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
              />
              <Search size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }} />
            </div>

            {/* Models Vertical List */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                maxHeight: "55vh",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {catalogLoading && (
                <div className="flex items-center justify-center" style={{ padding: "32px" }}>
                  <RefreshCw size={20} className="animate-spin text-indigo-400" />
                  <span style={{ marginLeft: "10px", fontSize: "13px" }}>Querying model catalog & probing candidates...</span>
                </div>
              )}

              {/* Recommended models */}
              {!catalogLoading && (
                <>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Recommended Models
                  </div>

                  {(recommendedMap[activeBottomSheetProvider] || [])
                    .filter((r) => !catalogSearch || r.model_id.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .map((rec) => (
                      <div
                        key={rec.model_id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-surface-solid)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: "220px", wordBreak: "break-all" }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <code style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {rec.model_id}
                            </code>
                            <span className="badge badge-primary" style={{ fontSize: "9px" }}>Recommended</span>
                            <span className="badge badge-success" style={{ fontSize: "9px" }}>Confirmed Free</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(rec.model_id, `sheet-${rec.model_id}`)}
                            className="btn btn-secondary btn-sm flex items-center gap-1"
                            style={{ minHeight: "36px", padding: "4px 8px", fontSize: "11px" }}
                            title="Copy model ID"
                          >
                            {copiedKey === `sheet-${rec.model_id}` ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectModelFromSheet(activeBottomSheetProvider, rec.model_id)}
                            className="btn btn-primary btn-sm flex items-center gap-1"
                            style={{ minHeight: "36px", padding: "6px 12px", fontSize: "12px" }}
                          >
                            <span>Use this model</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* Other Catalog Models */}
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "12px" }}>
                    Live Chat Catalog
                  </div>

                  {catalogCandidates
                    .filter((c) => !c.is_recommended)
                    .filter((c) => !catalogSearch || c.model_id.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .map((cand) => (
                      <div
                        key={cand.model_id}
                        style={{
                          padding: "12px 14px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "10px",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: "220px", wordBreak: "break-all" }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <code style={{ fontSize: "12px", color: "var(--text-primary)" }}>{cand.model_id}</code>
                            <span className="badge badge-secondary" style={{ fontSize: "9px" }}>{cand.model_family}</span>
                            <span className={`badge ${cand.status === "passed" ? "badge-success" : "badge-secondary"}`} style={{ fontSize: "9px" }}>
                              {cand.status}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(cand.model_id, `sheet-${cand.model_id}`)}
                            className="btn btn-secondary btn-sm flex items-center gap-1"
                            style={{ minHeight: "36px", padding: "4px 8px", fontSize: "11px" }}
                          >
                            {copiedKey === `sheet-${cand.model_id}` ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectModelFromSheet(activeBottomSheetProvider, cand.model_id)}
                            className="btn btn-secondary btn-sm"
                            style={{ minHeight: "36px", padding: "6px 12px", fontSize: "12px" }}
                          >
                            <span>Use this model</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  {/* Fallback free models from catalog listing */}
                  {catalogFreeModels
                    .filter((m) => !catalogCandidates.some((c) => c.model_id === m) && !(recommendedMap[activeBottomSheetProvider] || []).some((r) => r.model_id === m))
                    .filter((m) => !catalogSearch || m.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .map((mId) => (
                      <div
                        key={mId}
                        style={{
                          padding: "10px 14px",
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <code style={{ fontSize: "12px" }}>{mId}</code>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(mId, `sheet-${mId}`)}
                            className="btn btn-secondary btn-sm"
                            style={{ minHeight: "34px", padding: "4px 8px", fontSize: "11px" }}
                          >
                            {copiedKey === `sheet-${mId}` ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSelectModelFromSheet(activeBottomSheetProvider, mId)}
                            className="btn btn-secondary btn-sm"
                            style={{ minHeight: "34px", padding: "4px 10px", fontSize: "11px" }}
                          >
                            <span>Select</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Switch Logs Modal */}
      {isLogsOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setIsLogsOpen(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "680px",
              maxHeight: "80vh",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered size={20} style={{ color: "var(--accent-primary)" }} />
                <h3 style={{ fontSize: "17px", fontWeight: 700 }}>Auto-Switch Audit Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLogsOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Audit trail of automatic failover switches. You can revert any switch back to the previous model at any time.
            </p>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {logsLoading && (
                <div className="flex items-center justify-center" style={{ padding: "32px" }}>
                  <RefreshCw size={20} className="animate-spin text-indigo-400" />
                </div>
              )}

              {!logsLoading && switchLogs.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px", color: "var(--text-muted)", fontSize: "13px" }}>
                  No auto-switches recorded yet.
                </div>
              )}

              {!logsLoading &&
                switchLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "6px" }}>
                      <div className="flex items-center gap-2">
                        <strong style={{ textTransform: "capitalize" }}>{log.provider_key.replace("_", " ")}</strong>
                        <span className="badge badge-warning" style={{ fontSize: "10px" }}>Auto-Switched</span>
                        {log.reverted && <span className="badge badge-secondary" style={{ fontSize: "10px" }}>Reverted</span>}
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {new Date(log.switched_at).toLocaleString()}
                      </span>
                    </div>

                    <div style={{ color: "var(--text-primary)" }}>
                      Switched from <code>{log.old_model_id}</code> &rarr; <code>{log.new_model_id}</code>
                    </div>

                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Reason: {log.reason}
                    </div>

                    {!log.reverted && (
                      <button
                        type="button"
                        onClick={() => handleRevertLog(log.id)}
                        className="btn btn-secondary btn-sm flex items-center gap-1"
                        style={{ alignSelf: "flex-start", minHeight: "32px", padding: "4px 10px", fontSize: "11px" }}
                      >
                        <RotateCcw size={12} />
                        <span>Revert back to {log.old_model_id}</span>
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Recommended List Modal */}
      {isEditRecOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={() => setIsEditRecOpen(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: "100%",
              maxWidth: "580px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 style={{ fontSize: "17px", fontWeight: 700 }}>
                Edit Recommended Models: {recEditProvider.toUpperCase()}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditRecOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Reorder, add, or remove recommended models probed sequentially during auto-fix.
            </p>

            {/* List */}
            <div className="flex flex-col gap-2" style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {recEditList.map((m, idx) => {
                const recItem = (recommendedMap[recEditProvider] || []).find((r) => (r.pattern === m || r.model_id === m));
                const isUnresolved = recItem && (recItem.status === "no match in catalog" || !recItem.in_live_catalog);
                const resolvedId = recItem?.resolved_model_id;

                return (
                  <div
                    key={idx}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>#{idx + 1}</span>
                      <code style={{ fontSize: "12px" }}>{m}</code>
                      {isUnresolved && (
                        <span className="badge badge-warning" style={{ fontSize: "10px" }}>
                          no match in catalog
                        </span>
                      )}
                      {resolvedId && resolvedId !== m && (
                        <span style={{ fontSize: "11px", color: "var(--accent-primary)" }}>
                          &rarr; <code>{resolvedId}</code>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...recEditList];
                          const temp = next[idx - 1];
                          next[idx - 1] = next[idx];
                          next[idx] = temp;
                          setRecEditList(next);
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "4px" }}
                        title="Move up"
                      >
                        &uarr;
                      </button>
                      <button
                        type="button"
                        disabled={idx === recEditList.length - 1}
                        onClick={() => {
                          const next = [...recEditList];
                          const temp = next[idx + 1];
                          next[idx + 1] = next[idx];
                          next[idx] = temp;
                          setRecEditList(next);
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "4px" }}
                        title="Move down"
                      >
                        &darr;
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecEditList(recEditList.filter((_, i) => i !== idx))}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "4px", color: "var(--accent-rose)" }}
                        title="Remove model"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add new model ID to recommended list..."
                className="input-field"
                style={{ flex: 1, minHeight: "44px", fontSize: "12px" }}
                value={newRecInput}
                onChange={(e) => setNewRecInput(e.target.value)}
              />
              <button
                type="button"
                disabled={!newRecInput.trim()}
                onClick={() => {
                  if (newRecInput.trim()) {
                    setRecEditList([...recEditList, newRecInput.trim()]);
                    setNewRecInput("");
                  }
                }}
                className="btn btn-secondary flex items-center gap-1"
                style={{ minHeight: "44px" }}
              >
                <Plus size={16} />
                <span>Add</span>
              </button>
            </div>

            <div className="flex items-center justify-end gap-2" style={{ marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setIsEditRecOpen(false)}
                className="btn btn-secondary"
                style={{ minHeight: "44px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={recSaving}
                onClick={handleSaveEditRec}
                className="btn btn-primary flex items-center gap-1.5"
                style={{ minHeight: "44px", padding: "8px 18px" }}
              >
                {recSaving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Save Recommended List</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
