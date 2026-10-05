import React, { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { usePinLock } from "../context/PinLockContext";
import { useSync } from "../context/SyncContext";
import {
  Shield,
  Cpu,
  Check,
  Globe,
  Download,
  Upload,
  Database,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Layers,
  Sparkles,
  Zap,
  Server,
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  downloadTransactionsCsv,
  downloadBudgetsCsv,
  downloadDebtsCsv,
  downloadFullBackupJson,
  importTransactionsCsv,
  restoreFullBackupJson,
  ImportCsvResponse,
  RestoreBackupResponse,
} from "../api/data";

export const SettingsPage: React.FC = () => {
  const { user, updateSettings } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { isPinSet, encryptOffline, autoLockMinutes, setupPin, removePin, lockNow } = usePinLock();
  const { isOnline } = useSync();

  const [selectedCurrency, setSelectedCurrency] = useState(user?.currency || currency);
  const [maxDti, setMaxDti] = useState<number>(user?.settings?.max_dti_ratio || 40.0);
  const [minRunway, setMinRunway] = useState<number>(user?.settings?.min_runway_months || 3.0);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Security / PIN State
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [showPinText, setShowPinText] = useState(false);
  const [selectedAutoLock, setSelectedAutoLock] = useState<number>(autoLockMinutes || 5);
  const [encryptDataCheck, setEncryptDataCheck] = useState<boolean>(encryptOffline || false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [createMissingCats, setCreateMissingCats] = useState(true);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportCsvResponse | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // JSON Restore State
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [overwriteRestore, setOverwriteRestore] = useState(false);
  const [jsonRestoring, setJsonRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreBackupResponse | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

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

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvError(null);
    setCsvResult(null);
    try {
      const res = await importTransactionsCsv(csvFile, createMissingCats);
      setCsvResult(res);
      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch (err: any) {
      setCsvError(err.message || "Failed to import CSV statement.");
    } finally {
      setCsvImporting(false);
    }
  };

  const handleJsonRestore = async () => {
    if (!jsonFile) return;
    if (overwriteRestore) {
      const confirmed = window.confirm(
        "WARNING: You have selected 'Overwrite Existing Data'. This will completely replace your current transactions, budgets, debts, goals, and council records with the backup file. Proceed?"
      );
      if (!confirmed) return;
    }
    setJsonRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const res = await restoreFullBackupJson(jsonFile, overwriteRestore);
      setRestoreResult(res);
      setJsonFile(null);
      if (jsonInputRef.current) jsonInputRef.current.value = "";
    } catch (err: any) {
      setRestoreError(err.message || "Failed to restore database from backup.");
    } finally {
      setJsonRestoring(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (pinInput.length < 4 || pinInput.length > 8) {
      setPinError("PIN must be between 4 and 8 digits.");
      return;
    }

    if (pinInput !== confirmPinInput) {
      setPinError("PINs do not match. Please re-enter.");
      return;
    }

    try {
      await setupPin(pinInput, encryptDataCheck, selectedAutoLock);
      setPinSuccess(isPinSet ? "PIN and security settings updated successfully!" : "App PIN Lock configured successfully!");
      setPinInput("");
      setConfirmPinInput("");
      setIsChangingPin(false);
      setTimeout(() => setPinSuccess(null), 4000);
    } catch (err: any) {
      setPinError(err.message || "Failed to set PIN.");
    }
  };

  const handleRemovePin = async () => {
    if (!window.confirm("Are you sure you want to disable PIN Lock and local data encryption?")) return;
    try {
      await removePin();
      setPinSuccess("PIN Lock removed.");
      setIsChangingPin(false);
      setTimeout(() => setPinSuccess(null), 3000);
    } catch (err: any) {
      setPinError(err.message || "Failed to remove PIN.");
    }
  };

  const providerFamilies = [
    { name: "Google Gemini", family: "Google Gemini Family", defaultModel: "gemini-2.5-flash", icon: <Sparkles size={16} />, status: "Active (Free Tier)" },
    { name: "Groq GPT-OSS", family: "OpenAI / GPT-OSS Family", defaultModel: "openai/gpt-oss-120b", icon: <Zap size={16} />, status: "Active (Ultra-Fast Free Tier)" },
    { name: "Mistral AI", family: "Mistral Family", defaultModel: "mistral-small-latest", icon: <Shield size={16} />, status: "Active (European Free Tier)" },
    { name: "OpenRouter Qwen", family: "Qwen Family", defaultModel: "qwen/qwen-2.5-72b-instruct:free", icon: <Globe size={16} />, status: "Active (Free Tier)" },
    { name: "Cerebras Llama", family: "Meta Llama Family", defaultModel: "llama3.3-70b", icon: <Cpu size={16} />, status: "Optional (Paid / Trial Only)" },
    { name: "Ollama (Local Offline)", family: "Self-Hosted Private", defaultModel: "llama3.2", icon: <Server size={16} />, status: isHosted ? "Disabled in Hosted Mode" : "Local / Offline Only" },
  ];

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: "860px" }}>
      <div>
        <h1 style={{ fontSize: "26px" }}>Settings & Data Management</h1>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Configure currency, financial guardrails, backup database, and manage CSV statements
        </span>
      </div>

      {savedSuccess && (
        <div className="badge-success flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
          <Check size={16} />
          <span>Settings successfully saved and updated!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* 1. Currency & Display */}
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
            If a proposed purchase exceeds your Max DTI or reduces your runway below the Minimum Runway threshold, the Council triggers a prominent red guardrail warning regardless of model votes.
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

        <button type="submit" disabled={loading} className="btn btn-primary" style={{ alignSelf: "flex-start", minHeight: "44px" }}>
          <span>{loading ? "Saving Settings..." : "Save Preferences"}</span>
        </button>
      </form>

      {/* 2.5. App Security, PIN Lock & Offline Data Encryption */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
          <div className="flex items-center gap-2">
            <Lock size={20} style={{ color: "var(--accent-primary)" }} />
            <h3 style={{ fontSize: "17px" }}>App Security & Local PIN Lock</h3>
          </div>
          {isPinSet && (
            <span className="badge badge-success flex items-center gap-1">
              <Check size={12} />
              <span>PIN Protection Active</span>
            </span>
          )}
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Protect your sensitive financial data behind a local PIN lock and derive a 256-bit AES-GCM key via Web Crypto to encrypt IndexedDB records on this device.
        </p>

        {pinSuccess && (
          <div className="badge-success flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
            <Check size={16} />
            <span>{pinSuccess}</span>
          </div>
        )}

        {pinError && (
          <div className="badge-danger flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
            <AlertCircle size={16} />
            <span>{pinError}</span>
          </div>
        )}

        {isPinSet && !isChangingPin ? (
          <div className="flex flex-col gap-4">
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface-solid)",
                border: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Auto-lock Idle Timeout:</span>
                <strong>{autoLockMinutes} minutes</strong>
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Offline Data Encryption (AES-GCM):</span>
                <strong style={{ color: encryptOffline ? "var(--success)" : "var(--text-muted)" }}>
                  {encryptOffline ? "Enabled (PBKDF2 + AES-GCM)" : "Disabled (Standard IndexedDB)"}
                </strong>
              </div>
            </div>

            <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={lockNow}
                className="btn btn-secondary flex items-center gap-2"
                style={{ minHeight: "44px" }}
              >
                <Lock size={16} />
                <span>Lock App Now</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsChangingPin(true);
                  setPinInput("");
                  setConfirmPinInput("");
                  setPinError(null);
                }}
                className="btn btn-secondary flex items-center gap-2"
                style={{ minHeight: "44px" }}
              >
                <KeyRound size={16} />
                <span>Change PIN or Auto-Lock</span>
              </button>

              <button
                type="button"
                onClick={handleRemovePin}
                className="btn btn-danger flex items-center gap-2"
                style={{ minHeight: "44px" }}
              >
                <Unlock size={16} />
                <span>Disable PIN Lock</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSavePin} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="input-group">
                <label className="input-label">Set 4-8 Digit PIN</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPinText ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    required
                    placeholder="Enter PIN (e.g. 1234)"
                    className="input-field"
                    style={{ paddingRight: "40px", minHeight: "44px" }}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinText(!showPinText)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                  >
                    {showPinText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">Confirm PIN</label>
                <input
                  type={showPinText ? "text" : "password"}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  required
                  placeholder="Re-enter PIN"
                  className="input-field"
                  style={{ minHeight: "44px" }}
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="input-group">
                <label className="input-label">Auto-Lock Idle Timeout</label>
                <select
                  className="input-field"
                  style={{ minHeight: "44px" }}
                  value={selectedAutoLock}
                  onChange={(e) => setSelectedAutoLock(parseInt(e.target.value) || 5)}
                >
                  <option value={1}>1 Minute</option>
                  <option value={2}>2 Minutes</option>
                  <option value={5}>5 Minutes (Default)</option>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                </select>
              </div>

              <div className="flex flex-col justify-center">
                <label className="flex items-start gap-2" style={{ cursor: "pointer", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={encryptDataCheck}
                    onChange={(e) => setEncryptDataCheck(e.target.checked)}
                    style={{ marginTop: "3px", width: "16px", height: "16px" }}
                  />
                  <div>
                    <strong style={{ color: "var(--text-primary)" }}>Encrypt Offline Data (AES-GCM)</strong>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Derives cryptographic encryption keys from your PIN using Web Crypto.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-sm)",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <strong>Note:</strong> Your PIN is hashed locally using PBKDF2 (100,000 iterations) and never sent to any server. If you forget your PIN, you can log in again online to re-sync your cloud financial data.
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-primary" style={{ minHeight: "44px" }}>
                <span>{isPinSet ? "Update Security Settings" : "Enable PIN Lock"}</span>
              </button>

              {isPinSet && isChangingPin && (
                <button
                  type="button"
                  onClick={() => setIsChangingPin(false)}
                  className="btn btn-secondary"
                  style={{ minHeight: "44px" }}
                >
                  <span>Cancel</span>
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* 3. Data Export & CSV Reports */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          <FileSpreadsheet size={20} style={{ color: "var(--accent-emerald)" }} />
          <h3 style={{ fontSize: "17px" }}>Data Export (CSV & Excel Friendly)</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Download standard, clean CSV exports of your financial records anytime for offline analysis, spreadsheets, or tax filing.
        </p>

        {!isOnline && (
          <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "12px" }}>
            <AlertCircle size={14} />
            <span>You are currently offline. Exporting from server requires an active connection.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadTransactionsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ padding: "12px 14px", minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Transactions CSV</span>
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadBudgetsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ padding: "12px 14px", minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Budgets CSV</span>
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadDebtsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ padding: "12px 14px", minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Debts CSV</span>
          </button>
        </div>
      </div>

      {/* 4. CSV Statement Import */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          <Upload size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: "17px" }}>Import Bank / Mobile Money CSV Statement</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Import transaction records from CSV files with automatic column detection (Date, Amount, Category, Memo/Payee, Type), currency sign removal, and duplicate avoidance.
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="input-field"
              style={{ flex: 1 }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setCsvFile(e.target.files[0]);
                  setCsvResult(null);
                  setCsvError(null);
                }
              }}
            />

            <button
              type="button"
              disabled={!isOnline || !csvFile || csvImporting}
              onClick={handleCsvImport}
              className="btn btn-primary flex items-center gap-2"
              style={{ minHeight: "44px" }}
            >
              {csvImporting ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{csvImporting ? "Importing..." : "Upload & Parse CSV"}</span>
            </button>
          </div>

          {!isOnline && (
            <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", fontSize: "12px" }}>
              <AlertCircle size={14} />
              <span>CSV import requires an active internet connection.</span>
            </div>
          )}

          <label className="flex items-center gap-2" style={{ fontSize: "13px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={createMissingCats}
              onChange={(e) => setCreateMissingCats(e.target.checked)}
            />
            <span>Automatically create new categories discovered in CSV if they don't already exist</span>
          </label>

          {csvError && (
            <div className="badge-danger flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
              <AlertCircle size={16} />
              <span>{csvError}</span>
            </div>
          )}

          {csvResult && (
            <div
              className="badge-success flex flex-col gap-1"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.1)" }}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Check size={16} />
                <span>Import Complete!</span>
              </div>
              <div style={{ fontSize: "12px" }}>
                Imported: <strong>{csvResult.imported_count}</strong> transactions • Skipped Duplicates: <strong>{csvResult.skipped_duplicates}</strong> • Categories Created: <strong>{csvResult.created_categories}</strong>
              </div>
              {csvResult.errors && csvResult.errors.length > 0 && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--accent-rose)" }}>
                  Row notes: {csvResult.errors.join("; ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Complete Database Backup & Restore (JSON) */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          <Database size={20} style={{ color: "var(--accent-purple)" }} />
          <h3 style={{ fontSize: "17px" }}>Full Database Backup & Disaster Recovery (JSON)</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Create a full, portable snapshot of your entire financial system — including all categories, transactions, budgets, savings goals, debts, and AI Council deliberated decisions.
        </p>

        {!isOnline && (
          <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "12px" }}>
            <AlertCircle size={14} />
            <span>Database backup and cloud restore require an active internet connection.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Backup Export */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div>
              <strong>Export Full Snapshot</strong>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Download complete encrypted JSON payload to your device.
              </div>
            </div>
            <button
              type="button"
              disabled={!isOnline}
              onClick={downloadFullBackupJson}
              className="btn btn-secondary flex items-center justify-center gap-2"
              style={{ marginTop: "auto", minHeight: "44px" }}
            >
              <Download size={16} />
              <span>Download Backup (.json)</span>
            </button>
          </div>

          {/* Backup Restore */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div>
              <strong>Restore From Backup</strong>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Restore or merge a previously exported MoneyCouncil JSON snapshot.
              </div>
            </div>

            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="input-field"
              disabled={!isOnline}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setJsonFile(e.target.files[0]);
                  setRestoreResult(null);
                  setRestoreError(null);
                }
              }}
            />

            <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                disabled={!isOnline}
                checked={overwriteRestore}
                onChange={(e) => setOverwriteRestore(e.target.checked)}
              />
              <span style={{ color: overwriteRestore ? "var(--accent-rose)" : "inherit" }}>
                Overwrite existing records (Wipes & replaces)
              </span>
            </label>

            <button
              type="button"
              disabled={!isOnline || !jsonFile || jsonRestoring}
              onClick={handleJsonRestore}
              className="btn btn-primary flex items-center justify-center gap-2"
              style={{ marginTop: "auto", minHeight: "44px" }}
            >
              {jsonRestoring ? <RefreshCw size={16} className="animate-spin" /> : <Layers size={16} />}
              <span>{jsonRestoring ? "Restoring..." : "Restore Database"}</span>
            </button>
          </div>
        </div>

        {restoreError && (
          <div className="badge-danger flex items-center gap-2" style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
            <AlertCircle size={16} />
            <span>{restoreError}</span>
          </div>
        )}

        {restoreResult && (
          <div
            className="badge-success flex flex-col gap-1"
            style={{ marginTop: "16px", padding: "14px 16px", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.1)" }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Check size={16} />
              <span>Restore Successful!</span>
            </div>
            <div style={{ fontSize: "12px" }}>
              Categories: <strong>{restoreResult.restored_categories}</strong> • Transactions: <strong>{restoreResult.restored_transactions}</strong> • Budgets: <strong>{restoreResult.restored_budgets}</strong> • Goals: <strong>{restoreResult.restored_savings_goals}</strong> • Debts: <strong>{restoreResult.restored_debts}</strong> • Council Decisions: <strong>{restoreResult.restored_council_decisions}</strong>
            </div>
          </div>
        )}
      </div>

      {/* 6. AI Council Provider Families Info */}
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
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-surface-raised)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {p.icon}
                  </div>
                  <div>
                    <strong style={{ color: "var(--text-primary)" }}>{p.name}</strong>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Family: {p.family} • Default: <code>{p.defaultModel}</code>
                    </div>
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
