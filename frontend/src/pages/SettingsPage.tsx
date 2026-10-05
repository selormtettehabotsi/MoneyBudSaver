import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { Shield, Cpu, Check, Globe } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { user, updateSettings } = useAuth();
  const { currency, setCurrency } = useCurrency();

  const [selectedCurrency, setSelectedCurrency] = useState(user?.currency || currency);
  const [maxDti, setMaxDti] = useState<number>(user?.settings?.max_dti_ratio || 40.0);
  const [minRunway, setMinRunway] = useState<number>(user?.settings?.min_runway_months || 3.0);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const isHosted = user?.is_hosted || false;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSavedSuccess(false);
    try {
      await updateSettings(selectedCurrency, {
        max_dti_ratio: maxDti,
        min_runway_months: minRunway,
      });
      setCurrency(selectedCurrency);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to update settings.");
    } finally {
      setLoading(false);
    }
  };

  const providerFamilies = [
    { name: "Google Gemini", family: "Gemini Family", defaultModel: "gemini-2.5-flash", icon: "sparkles", status: "Active (Free API)" },
    { name: "Groq Llama", family: "Meta Llama Family", defaultModel: "llama-3.3-70b-versatile", icon: "zap", status: "Active (Ultra-Fast Free)" },
    { name: "Cerebras Llama", family: "Meta Llama Family", defaultModel: "llama3.3-70b", icon: "cpu", status: "Active (Wafer-Scale Inference)" },
    { name: "Mistral AI", family: "Mistral Family", defaultModel: "mistral-small-latest", icon: "shield", status: "Active (European Free Tier)" },
    { name: "OpenRouter DeepSeek", family: "DeepSeek / Qwen Family", defaultModel: "deepseek/deepseek-chat", icon: "globe", status: "Active (Free Models)" },
    { name: "Ollama (Local Offline)", family: "Self-Hosted Private", defaultModel: "llama3.2", icon: "server", status: isHosted ? "Disabled in Hosted Mode" : "Local / Offline Only" },
  ];

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: "800px" }}>
      <div>
        <h1 style={{ fontSize: "26px" }}>Settings & AI Configuration</h1>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Configure currency, financial guardrails, and AI Council provider settings
        </span>
      </div>

      {savedSuccess && (
        <div className="badge-success flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
          <Check size={16} />
          <span>Settings successfully saved and updated!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* 1. Currency & Localization */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
            <Globe size={20} style={{ color: "var(--accent-primary)" }} />
            <h3 style={{ fontSize: "17px" }}>Currency & Display</h3>
          </div>

          <div className="input-group">
            <label className="input-label">Active Currency</label>
            <select
              className="input-field"
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
            >
              <option value="GHS">GHS (GH₵) - Ghana Cedi (Default)</option>
              <option value="USD">USD ($) - United States Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="GBP">GBP (£) - British Pound Sterling</option>
              <option value="NGN">NGN (₦) - Nigerian Naira</option>
              <option value="KES">KES (KSh) - Kenyan Shilling</option>
              <option value="ZAR">ZAR (R) - South African Rand</option>
              <option value="CAD">CAD (CA$) - Canadian Dollar</option>
              <option value="AUD">AUD (A$) - Australian Dollar</option>
              <option value="INR">INR (₹) - Indian Rupee</option>
            </select>
          </div>
        </div>

        {/* 2. Hard Financial Guardrails */}
        <div className="glass-panel" style={{ padding: "24px" }}>
          <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
            <Shield size={20} style={{ color: "var(--accent-secondary)" }} />
            <h3 style={{ fontSize: "17px" }}>Hard Financial Guardrails</h3>
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
            If a proposed decision exceeds your Max DTI or reduces your runway below the Minimum Runway threshold, the Council triggers a prominent red guardrail warning regardless of model votes.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label">Max Debt-to-Income Ratio (% DTI)</label>
              <input
                type="number"
                step="1"
                min="10"
                max="80"
                className="input-field"
                value={maxDti}
                onChange={(e) => setMaxDti(parseFloat(e.target.value) || 40.0)}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Recommended standard: 35% - 40%</span>
            </div>

            <div className="input-group">
              <label className="input-label">Minimum Safe Runway (Months)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="24"
                className="input-field"
                value={minRunway}
                onChange={(e) => setMinRunway(parseFloat(e.target.value) || 3.0)}
              />
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Recommended emergency fund: 3.0 - 6.0 months</span>
            </div>
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          <span>{loading ? "Saving Settings..." : "Save Preferences"}</span>
        </button>
      </form>

      {/* 3. AI Council Provider Families Info */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          <Cpu size={20} style={{ color: "var(--accent-purple)" }} />
          <h3 style={{ fontSize: "17px" }}>Council AI Members & Model Families</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          The Council integrates 4+ distinct free model families to ensure unbiased consensus and independent financial deliberation.
        </p>

        <div className="flex flex-col gap-3">
          {providerFamilies.map((p) => {
            const isLocalDisabled = p.name.includes("Ollama") && isHosted;
            return (
              <div
                key={p.name}
                className="flex items-center justify-between"
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-surface-solid)",
                  border: "1px solid var(--border-color)",
                  opacity: isLocalDisabled ? 0.6 : 1,
                }}
              >
                <div>
                  <strong style={{ color: "var(--text-primary)" }}>{p.name}</strong>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Family: {p.family} • Default: <code>{p.defaultModel}</code>
                  </div>
                </div>

                <span className={`badge ${isLocalDisabled ? "badge-warning" : "badge-success"}`}>
                  {p.status}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
