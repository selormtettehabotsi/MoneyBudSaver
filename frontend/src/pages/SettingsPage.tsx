import React, { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { usePinLock } from "../context/PinLockContext";
import { useSync } from "../context/SyncContext";
import { useServerStatus } from "../context/ServerStatusContext";
import {
  Server,
  Globe,
  Shield,
  Key,
  Check,
  CheckCircle2,
  XCircle,
  Info,
  Download,
  Upload,
  Database,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Layers,
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
import { authApi } from "../api/auth";
import { AIModelsManager } from "../components/council/AIModelsManager";

export const SettingsPage: React.FC = () => {
  const { user, updateSettings } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { isPinSet, encryptOffline, autoLockMinutes, setupPin, removePin, lockNow } = usePinLock();
  const { isOnline } = useSync();
  const {
    isWarming,
    retryCount,
    serverStatus,
    lastError,
    lastChecked,
    latencyMs,
    isChecking,
    checkBackendHealth,
    dismissError,
  } = useServerStatus();

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

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError("New password must be at least 12 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await authApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(res.message || "Password changed successfully! Other active sessions were invalidated.");
      // Clear password fields immediately
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(null), 5000);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password. Please check your current password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: "860px", width: "100%" }}>
      <div>
        <h1 style={{ fontSize: "26px" }}>Settings & Data Management</h1>
        <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Configure server health, currencies, financial guardrails, backups, and AI model providers
        </span>
      </div>

      {/* Backend & Server Connection Health Card */}
      <div
        className="glass-panel"
        style={{
          padding: "20px 24px",
          border:
            serverStatus === "error" || lastError
              ? "1px solid var(--danger-border)"
              : isWarming
              ? "1px solid var(--warning-border)"
              : "1px solid var(--border-color)",
          background:
            serverStatus === "error" || lastError
              ? "rgba(244, 63, 94, 0.04)"
              : isWarming
              ? "rgba(245, 158, 11, 0.04)"
              : "var(--bg-surface)",
        }}
      >
        <div className="flex items-center justify-between" style={{ flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
          <div className="flex items-center gap-2.5">
            <Server size={20} style={{ color: "var(--accent-primary)" }} />
            <h3 style={{ fontSize: "17px" }}>MoneyCouncil Backend & Server Health</h3>
          </div>

          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
            {isWarming ? (
              <span className="badge badge-warning flex items-center gap-1.5" style={{ fontSize: "12px", padding: "4px 10px" }}>
                <RefreshCw size={13} className="animate-spin" />
                <span>Waking Up Backend... {retryCount > 0 ? `(Attempt ${retryCount}/3)` : ""}</span>
              </span>
            ) : serverStatus === "operational" && !lastError ? (
              <span className="badge badge-success flex items-center gap-1.5" style={{ fontSize: "12px", padding: "4px 10px" }}>
                <CheckCircle2 size={13} />
                <span>Operational & Connected</span>
              </span>
            ) : (
              <span className="badge badge-danger flex items-center gap-1.5" style={{ fontSize: "12px", padding: "4px 10px" }}>
                <AlertCircle size={13} />
                <span>Connection Issue Detected</span>
              </span>
            )}

            <button
              type="button"
              disabled={isChecking}
              onClick={checkBackendHealth}
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              style={{ minHeight: "36px", padding: "6px 12px", fontSize: "12px" }}
              title="Ping backend server and measure latency"
            >
              <RefreshCw size={13} className={isChecking ? "animate-spin" : ""} />
              <span>{isChecking ? "Pinging..." : "Check Health"}</span>
            </button>
          </div>
        </div>

        {/* Diagnostic Details */}
        <div className="flex items-center justify-between" style={{ fontSize: "12px", color: "var(--text-secondary)", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <span>Backend Status: </span>
            <strong style={{ color: "var(--text-primary)" }}>
              {isWarming
                ? `Warming up from idle (${retryCount > 0 ? `Attempt ${retryCount} of 3` : "Connecting..."})`
                : serverStatus === "operational" && !lastError
                ? "Active & Ready"
                : "Server Unreachable"}
            </strong>
            {latencyMs !== null && serverStatus === "operational" && !lastError && (
              <span style={{ marginLeft: "6px", color: "var(--accent-secondary)" }}>
                • Latency: <strong>{latencyMs}ms</strong>
              </span>
            )}
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Last checked: {lastChecked ? lastChecked.toLocaleTimeString() : "Pending"}
          </div>
        </div>

        {/* Server Alert Banner if Problem Occurs */}
        {(lastError || serverStatus === "error") && (
          <div
            className="badge-danger flex items-start justify-between gap-3"
            style={{
              marginTop: "14px",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              fontSize: "12px",
              lineHeight: 1.5,
              flexWrap: "wrap",
            }}
          >
            <div className="flex items-start gap-2.5" style={{ flex: 1, minWidth: "220px" }}>
              <AlertCircle size={18} className="text-rose-400" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ fontSize: "13px" }}>Server Connection Alert:</strong>
                <p style={{ margin: "3px 0 0 0" }}>
                  {lastError || "The web app was unable to reach the MoneyCouncil backend server after multiple attempts."}
                </p>
                <p style={{ margin: "4px 0 0 0", color: "var(--text-muted)", fontSize: "11px" }}>
                  Troubleshooting: If your backend is hosted on Render or cloud hosting, it may take 30-50 seconds to complete cold-start boot. Check your internet connection or cloud dashboard.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2" style={{ alignSelf: "flex-end", marginTop: "4px" }}>
              <button
                type="button"
                onClick={checkBackendHealth}
                className="btn btn-secondary btn-sm"
                style={{ minHeight: "32px", padding: "4px 10px", fontSize: "11px" }}
              >
                <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
                <span>Retry Connection</span>
              </button>
              <button
                type="button"
                onClick={dismissError}
                className="btn btn-ghost btn-sm"
                style={{ minHeight: "32px", padding: "4px 8px", fontSize: "11px", color: "var(--text-muted)" }}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* 2.6. Account Password Security */}
      <div className="glass-panel" style={{ padding: "24px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "16px" }}>
          <Key size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: "17px" }}>Change Account Password</h3>
        </div>

        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Update your login password. Changing your password invalidates all other active login sessions for safety.
        </p>

        {passwordSuccess && (
          <div
            className="badge-success flex items-center gap-2"
            style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}
          >
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        {passwordError && (
          <div
            className="badge-danger flex items-center gap-2"
            style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", marginBottom: "16px" }}
          >
            <XCircle size={16} className="text-rose-400" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Current Password</label>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type={showCurrentPassword ? "text" : "password"}
                required
                className="input-field"
                style={{ paddingRight: "40px" }}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                style={{
                  position: "absolute",
                  right: "12px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                }}
                title={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label">New Password (min 12 chars)</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  minLength={12}
                  className="input-field"
                  style={{ paddingRight: "40px" }}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                  }}
                  title={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  minLength={12}
                  className="input-field"
                  style={{ paddingRight: "40px" }}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: "absolute",
                    right: "12px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    padding: "4px",
                  }}
                  title={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              fontSize: "12px",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Info size={14} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
            <span>Passwords are hashed with Bcrypt. Passwords must be at least 12 characters and max 72 bytes.</span>
          </div>

          <button
            type="submit"
            disabled={passwordLoading || !isOnline}
            className="btn btn-primary"
            style={{ alignSelf: "flex-start", minHeight: "44px" }}
          >
            {passwordLoading ? (
              <span className="flex items-center gap-2">
                <RefreshCw size={14} className="animate-spin" />
                <span>Updating Password...</span>
              </span>
            ) : (
              <span>Update Password</span>
            )}
          </button>
        </form>
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

      {/* 6. AI Council Models & Voters Manager */}
      <AIModelsManager />
    </div>
  );
};
