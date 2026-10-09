import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";
import { usePinLock } from "../context/PinLockContext";
import { useSync } from "../context/SyncContext";
import { useServerStatus } from "../context/ServerStatusContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmDialogContext";
import {
  Globe,
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Cpu,
  Database,
  Server,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ArrowRight,
  Download,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react";
import {
  downloadTransactionsCsv,
  downloadBudgetsCsv,
  downloadDebtsCsv,
  downloadFullBackupJson,
} from "../api/data";
import { authApi } from "../api/auth";
import { AIModelsManager } from "../components/council/AIModelsManager";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";

type SettingsTab = "general" | "guardrails" | "security" | "models" | "data" | "status";

export const SettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { user, updateSettings } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const { isPinSet, autoLockMinutes, setupPin, removePin, lockNow } = usePinLock();
  const { isOnline, syncStatus, outboxItems, triggerSync } = useSync();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const { confirm } = useConfirm();

  const {
    isWarming,
    retryCount,
    serverStatus,
    lastError,
    lastChecked,
    latencyMs,
    isChecking,
    checkBackendHealth,
  } = useServerStatus();

  // Tab State
  const tabFromUrl = searchParams.get("tab") as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(tabFromUrl || "general");

  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // General & Guardrails State
  const [selectedCurrency, setSelectedCurrency] = useState(user?.currency || currency);
  const [maxDti, setMaxDti] = useState<number>(user?.settings?.max_dti_ratio || 40.0);
  const [minRunway, setMinRunway] = useState<number>(user?.settings?.min_runway_months || 3.0);
  const [generalLoading, setGeneralLoading] = useState(false);
  const [guardrailLoading, setGuardrailLoading] = useState(false);

  // Security / PIN State
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [showPinText, setShowPinText] = useState(false);
  const [selectedAutoLock, setSelectedAutoLock] = useState<number>(autoLockMinutes || 5);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Save General Preferences
  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralLoading(true);
    try {
      await updateSettings(selectedCurrency, {
        max_dti_ratio: maxDti,
        min_runway_months: minRunway,
      });
      setCurrency(selectedCurrency);
      toast.success("General preferences updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update preferences.");
    } finally {
      setGeneralLoading(false);
    }
  };

  // Save Financial Guardrails
  const handleSaveGuardrails = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardrailLoading(true);
    try {
      await updateSettings(currency, {
        max_dti_ratio: maxDti,
        min_runway_months: minRunway,
      });
      toast.success("Financial guardrails saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update guardrails.");
    } finally {
      setGuardrailLoading(false);
    }
  };

  // Save PIN Configuration
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    if (pinInput.length < 4 || pinInput.length > 8) {
      setPinError("PIN must be between 4 and 8 digits.");
      return;
    }

    if (pinInput !== confirmPinInput) {
      setPinError("PINs do not match. Please re-enter.");
      return;
    }

    try {
      await setupPin(pinInput, false, selectedAutoLock);
      toast.success(isPinSet ? "PIN and auto-lock settings updated!" : "App PIN Lock enabled successfully!");
      setPinInput("");
      setConfirmPinInput("");
      setIsChangingPin(false);
    } catch (err: any) {
      setPinError(err.message || "Failed to configure PIN.");
      toast.error(err.message || "Failed to configure PIN.");
    }
  };

  // Remove PIN Lock
  const handleRemovePin = async () => {
    const proceed = await confirm({
      title: "Disable PIN Lock?",
      message: "Are you sure you want to disable PIN Lock? Your session will no longer require a PIN upon idle timeout.",
      confirmText: "Disable PIN",
      cancelText: "Keep PIN",
      isDanger: true,
    });
    if (!proceed) return;

    try {
      await removePin();
      toast.success("PIN Lock disabled.");
      setIsChangingPin(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to remove PIN.");
    }
  };

  // Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

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
      toast.success(res.message || "Password changed successfully! Other active sessions were invalidated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const msg = err.message || "Failed to change password. Please check your current password.";
      setPasswordError(msg);
      toast.error(msg);
    } finally {
      setPasswordLoading(false);
    }
  };

  // Nav Items definition
  const navTabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: "general", label: "General & Display", icon: Globe },
    { id: "guardrails", label: "Financial Guardrails", icon: Shield },
    { id: "security", label: "Security & PIN", icon: Lock },
    { id: "models", label: "AI Models & Council", icon: Cpu },
    { id: "data", label: "Data & Backups", icon: Database },
    { id: "status", label: "System Status", icon: Server },
  ];

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Page Header */}
      <PageHeader
        title="Settings & System Management"
        subtitle="Manage your profile, currencies, financial guardrails, security lock, AI voters, and cloud health."
      />

      {/* Main Settings Layout: Sub-Nav on desktop, Tabs on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Sub-Nav Sidebar */}
        <div
          className="glass-panel col-span-1"
          style={{
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            position: "sticky",
            top: "84px",
          }}
        >
          {/* Mobile Tab Selector (shown only on mobile) */}
          <div className="lg:hidden" style={{ width: "100%", marginBottom: "8px" }}>
            <label className="input-label" style={{ marginBottom: "6px" }}>Settings Category</label>
            <select
              className="input-field"
              value={activeTab}
              onChange={(e) => handleTabChange(e.target.value as SettingsTab)}
              style={{ minHeight: "44px", width: "100%" }}
            >
              {navTabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop Nav Items */}
          <div className="hidden lg:flex flex-col gap-1">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: isActive ? "var(--accent-primary-glow)" : "transparent",
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 500,
                    fontSize: "13px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s ease",
                    minHeight: "42px",
                  }}
                >
                  <Icon size={17} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{tab.label}</span>
                  {tab.id === "security" && isPinSet && (
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "var(--success)",
                      }}
                      title="PIN Lock Active"
                    />
                  )}
                  {tab.id === "status" && (serverStatus === "error" || lastError) && (
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: "var(--danger)",
                      }}
                      title="Server Warning"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Pane */}
        <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">
          {/* TAB 1: GENERAL & DISPLAY */}
          {activeTab === "general" && (
            <div className="flex flex-col gap-6">
              {/* User Account Profile Card */}
              <Card title="Account Profile" subtitle="Your MoneyCouncil profile and local sync credentials.">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "18px",
                      }}
                    >
                      {user?.email?.charAt(0).toUpperCase() || "M"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
                        {user?.email || "Signed In"}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="info">Primary Owner</Badge>
                        <Badge variant={isOnline ? "success" : "warning"}>
                          {isOnline ? "Cloud Connected" : "Local Offline Mode"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {isPinSet && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={lockNow}
                      icon={Lock}
                    >
                      Lock App Now
                    </Button>
                  )}
                </div>
              </Card>

              {/* Theme & Appearance */}
              <Card title="Visual Theme" subtitle="Switch between modern Dark Obsidian and warm eye-friendly Light mode.">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                      Active Interface Theme
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                      {theme === "light"
                        ? "Warm Cream & Linen (soft contrast for daytime and low-glare reading)"
                        : "Dark Obsidian (deep navy and charcoal for nighttime focus)"}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleTheme}
                    icon={theme === "light" ? Moon : Sun}
                  >
                    Switch to {theme === "light" ? "Dark Mode" : "Light Mode"}
                  </Button>
                </div>
              </Card>

              {/* Active Currency */}
              <form onSubmit={handleSaveGeneral}>
                <Card
                  title="Currency & Regional Formatting"
                  subtitle="Choose the default currency for transaction metrics, budgets, and council financial analysis."
                  footer={
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={generalLoading}
                      disabled={generalLoading}
                    >
                      Save Preferences
                    </Button>
                  }
                >
                  <div className="input-group" style={{ maxWidth: "420px" }}>
                    <label className="input-label">Default Base Currency</label>
                    <select
                      className="input-field"
                      value={selectedCurrency}
                      onChange={(e) => setSelectedCurrency(e.target.value)}
                      style={{ minHeight: "44px" }}
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
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      All monetary numbers in dashboards and transactions will format using this currency.
                    </span>
                  </div>
                </Card>
              </form>
            </div>
          )}

          {/* TAB 2: FINANCIAL GUARDRAILS */}
          {activeTab === "guardrails" && (
            <form onSubmit={handleSaveGuardrails} className="flex flex-col gap-6">
              <Card
                title="Hard Financial Guardrails"
                subtitle="Enforce hard budgetary limits that trigger red warnings during AI Council deliberation, overriding model approvals."
                footer={
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={guardrailLoading}
                    disabled={guardrailLoading}
                  >
                    Save Guardrails
                  </Button>
                }
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-surface-solid)",
                    border: "1px solid var(--border-color)",
                    marginBottom: "20px",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)", marginBottom: "4px" }}>
                    <Shield size={16} style={{ color: "var(--accent-secondary)" }} />
                    <span>How Guardrails Protect You</span>
                  </div>
                  If a proposed purchase pushes your debt-to-income ratio above the threshold, or drops your liquid emergency runway below safe months, the Council flags it with a prominent red guardrail alert.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                      style={{ minHeight: "44px" }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Healthy benchmark: 35% - 40% of gross income
                    </span>
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
                      style={{ minHeight: "44px" }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Recommended emergency reserve: 3.0 to 6.0 months
                    </span>
                  </div>
                </div>
              </Card>
            </form>
          )}

          {/* TAB 3: SECURITY & PIN */}
          {activeTab === "security" && (
            <div className="flex flex-col gap-6">
              {/* App PIN Lock */}
              <Card
                title="Local PIN Protection"
                subtitle="Lock MoneyCouncil behind a numeric passcode with automatic idle screen timeout."
                headerAction={
                  isPinSet ? (
                    <Badge variant="success">
                      <Check size={12} style={{ marginRight: "4px" }} /> PIN Active
                    </Badge>
                  ) : (
                    <Badge variant="neutral">PIN Disabled</Badge>
                  )
                }
              >
                {/* Bug 8 Clarification Note */}
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md)",
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginBottom: "16px",
                    lineHeight: 1.5,
                  }}
                >
                  <strong style={{ color: "var(--text-primary)" }}>Device Security Standard:</strong>
                  <div>
                    Your PIN is hashed locally using PBKDF2 (100,000 iterations with SHA-256) and never transmitted to our servers. Local offline database records in IndexedDB are protected behind your browser device sandbox and PIN lock screen.
                  </div>
                </div>

                {pinError && (
                  <div
                    className="badge-danger flex items-center gap-2"
                    style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: "14px", fontSize: "13px" }}
                  >
                    <AlertCircle size={16} />
                    <span>{pinError}</span>
                  </div>
                )}

                {isPinSet && !isChangingPin ? (
                  <div className="flex flex-col gap-4">
                    <div
                      style={{
                        padding: "14px 16px",
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
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                          Auto-Lock Timeout
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          App locks automatically after {autoLockMinutes} minutes of inactivity
                        </div>
                      </div>
                      <Badge variant="info">{autoLockMinutes} minutes</Badge>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={lockNow}
                        icon={Lock}
                      >
                        Lock Screen Now
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setIsChangingPin(true);
                          setPinInput("");
                          setConfirmPinInput("");
                          setPinError(null);
                        }}
                        icon={KeyRound}
                      >
                        Change PIN Code
                      </Button>

                      <Button
                        type="button"
                        variant="danger"
                        onClick={handleRemovePin}
                        icon={Unlock}
                      >
                        Disable PIN Lock
                      </Button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSavePin} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="input-group">
                        <label className="input-label">Set 4 to 8 Digit PIN</label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showPinText ? "text" : "password"}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={8}
                            required
                            placeholder="Enter 4-8 digits"
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

                    <div className="input-group" style={{ maxWidth: "300px" }}>
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

                    <div className="flex items-center gap-3 mt-2">
                      <Button type="submit" variant="primary">
                        {isPinSet ? "Update PIN Settings" : "Enable PIN Lock"}
                      </Button>
                      {isPinSet && isChangingPin && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setIsChangingPin(false)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                )}
              </Card>

              {/* Account Password Change */}
              <Card
                title="Change Account Password"
                subtitle="Update your master password. Other active browser sessions will be invalidated for security."
              >
                {passwordError && (
                  <div
                    className="badge-danger flex items-center gap-2"
                    style={{ padding: "10px 14px", borderRadius: "var(--radius-md)", marginBottom: "16px", fontSize: "13px" }}
                  >
                    <AlertCircle size={16} />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                  <div className="input-group" style={{ maxWidth: "420px" }}>
                    <label className="input-label">Current Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        required
                        className="input-field"
                        style={{ paddingRight: "40px", minHeight: "44px" }}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
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
                        {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="input-group">
                      <label className="input-label">New Password (min 12 chars)</label>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          minLength={12}
                          className="input-field"
                          style={{ paddingRight: "40px", minHeight: "44px" }}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 12 characters"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
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
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="input-group">
                      <label className="input-label">Confirm New Password</label>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          minLength={12}
                          className="input-field"
                          style={{ paddingRight: "40px", minHeight: "44px" }}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                          {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      isLoading={passwordLoading}
                      disabled={passwordLoading || !isOnline}
                    >
                      Update Password
                    </Button>
                    {!isOnline && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Password change requires online connection.
                      </span>
                    )}
                  </div>
                </form>
              </Card>
            </div>
          )}

          {/* TAB 4: AI MODELS & COUNCIL */}
          {activeTab === "models" && (
            <div className="flex flex-col gap-6">
              <AIModelsManager />
            </div>
          )}

          {/* TAB 5: DATA & BACKUPS */}
          {activeTab === "data" && (
            <div className="flex flex-col gap-6">
              <Card
                title="Data & Disaster Recovery Center"
                subtitle="Statement import, spreadsheet exports, and complete JSON disaster recovery snapshots."
              >
                <div className="flex flex-col gap-4">
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    All statement parsing, duplicate-prevention imports, spreadsheet exports, and JSON database restore tools are consolidated in the dedicated Data & Backups hub.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isOnline}
                      onClick={downloadTransactionsCsv}
                      icon={Download}
                    >
                      Transactions CSV
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isOnline}
                      onClick={downloadBudgetsCsv}
                      icon={Download}
                    >
                      Budgets CSV
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isOnline}
                      onClick={downloadDebtsCsv}
                      icon={Download}
                    >
                      Debts CSV
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={!isOnline}
                      onClick={downloadFullBackupJson}
                      icon={Download}
                    >
                      Backup JSON
                    </Button>
                  </div>

                  <div style={{ marginTop: "8px" }}>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => navigate("/data")}
                      icon={ArrowRight}
                    >
                      Open Full Data & Backups Page
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 6: SYSTEM STATUS */}
          {activeTab === "status" && (
            <div className="flex flex-col gap-6">
              <Card
                title="MoneyCouncil Backend & Server Health"
                subtitle="Real-time connectivity diagnostics, cloud host latency, and local synchronization status."
                headerAction={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isChecking}
                    onClick={checkBackendHealth}
                    isLoading={isChecking}
                    icon={RefreshCw}
                  >
                    Check Health
                  </Button>
                }
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Server Status</div>
                    <div className="flex items-center gap-2 mt-1">
                      {isWarming ? (
                        <Badge variant="warning">Waking Up ({retryCount}/3)</Badge>
                      ) : serverStatus === "operational" && !lastError ? (
                        <Badge variant="success">Operational</Badge>
                      ) : (
                        <Badge variant="danger">Unreachable</Badge>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Roundtrip Latency</div>
                    <div style={{ fontSize: "18px", fontWeight: 700, marginTop: "4px", fontFamily: "var(--font-mono)" }}>
                      {latencyMs !== null && serverStatus === "operational" && !lastError ? `${latencyMs}ms` : "—"}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "14px 16px",
                      borderRadius: "var(--radius-md)",
                      background: "var(--bg-surface-solid)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Last Ping Probe</div>
                    <div style={{ fontSize: "13px", fontWeight: 600, marginTop: "6px" }}>
                      {lastChecked ? lastChecked.toLocaleTimeString() : "Pending"}
                    </div>
                  </div>
                </div>

                {/* Cold Start Explanation */}
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-surface-solid)",
                    border: "1px solid var(--border-color)",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)", marginBottom: "4px" }}>
                    <Activity size={16} style={{ color: "var(--accent-primary)" }} />
                    <span>Cloud Host Cold-Start Resilience</span>
                  </div>
                  MoneyCouncil includes automated retry logic with exponential backoff. If your backend is sleeping on Render or another free tier, the web app continues gracefully and polls until spin-up finishes.
                </div>

                {/* Offline Sync Status */}
                <div
                  style={{
                    marginTop: "16px",
                    padding: "14px 16px",
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
                  <div className="flex items-center gap-3">
                    {isOnline ? (
                      <Wifi size={20} style={{ color: "var(--success)" }} />
                    ) : (
                      <WifiOff size={20} style={{ color: "var(--warning)" }} />
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                        Local Offline Outbox
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {outboxItems.length === 0
                          ? "All local transactions synced with server"
                          : `${outboxItems.length} transactions pending upload`}
                      </div>
                    </div>
                  </div>

                  {outboxItems.length > 0 && isOnline && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={triggerSync}
                      isLoading={syncStatus === "syncing"}
                      icon={RefreshCw}
                    >
                      Sync Outbox Now
                    </Button>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
