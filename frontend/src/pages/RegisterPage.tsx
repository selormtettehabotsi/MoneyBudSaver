import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, KeyRound, Globe, ArrowRight, Eye, EyeOff, ShieldCheck, Scale, Sparkles } from "lucide-react";
import { Button } from "../components/common/Button";

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigateToLogin }) => {
  const { register } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [currency, setCurrency] = useState("GHS");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  const currencies = [
    { code: "GHS", label: "Ghanaian Cedi (GH₵)", flag: "🇬🇭" },
    { code: "USD", label: "US Dollar ($)", flag: "🇺🇸" },
    { code: "EUR", label: "Euro (€)", flag: "🇪🇺" },
    { code: "GBP", label: "British Pound (£)", flag: "🇬🇧" },
    { code: "NGN", label: "Nigerian Naira (₦)", flag: "🇳🇬" },
    { code: "KES", label: "Kenyan Shilling (KSh)", flag: "🇰🇪" },
    { code: "ZAR", label: "South African Rand (R)", flag: "🇿🇦" },
    { code: "CAD", label: "Canadian Dollar (CA$)", flag: "🇨🇦" },
    { code: "AUD", label: "Australian Dollar (A$)", flag: "🇦🇺" },
    { code: "INR", label: "Indian Rupee (₹)", flag: "🇮🇳" },
  ];

  // Password strength scoring
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "Enter password", color: "var(--text-muted)" };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 1, label: "Weak (add letters/numbers)", color: "var(--danger)" };
    if (score <= 3) return { score: 2, label: "Moderate", color: "var(--warning)" };
    return { score: 3, label: "Strong & Secure", color: "var(--success)" };
  };

  const strength = getPasswordStrength(password);

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address";
    }

    if (!password) {
      errs.password = "Password is required";
    } else if (password.length < 8) {
      errs.password = "Password must be at least 8 characters";
    } else if (new TextEncoder().encode(password).length > 72) {
      errs.password = "Password exceeds maximum 72 bytes limit";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});
    try {
      await register(email, password, inviteCode.trim() || undefined, currency);
      toastSuccess("Account created successfully! Welcome to MoneyCouncil.");
    } catch (err: any) {
      const msg = err.message || "Registration failed. Please check your details.";
      setErrors({ general: msg });
      toastError(msg, "Registration Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        width: "100vw",
        background: "var(--bg-primary)",
      }}
    >
      {/* Desktop Split-Screen Left Brand Hero Panel */}
      <div
        className="auth-hero-panel"
        style={{
          flex: "1 1 48%",
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.08) 100%), var(--bg-secondary)",
          borderRight: "1px solid var(--border-color)",
          padding: "48px 60px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "48px" }}>
            <img src="/favicon.svg" alt="MoneyCouncil Logo" style={{ width: "40px", height: "40px" }} />
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-display)", letterSpacing: "-0.03em" }}>
                MoneyCouncil
              </h2>
              <span style={{ fontSize: "11px", color: "var(--accent-primary)", fontWeight: 700, letterSpacing: "0.05em" }}>
                SELF-HOSTED & CLOUD FINTECH
              </span>
            </div>
          </div>

          <div style={{ maxWidth: "480px" }}>
            <h1
              style={{
                fontSize: "clamp(2rem, 3.2vw, 2.75rem)",
                fontWeight: 800,
                fontFamily: "var(--font-display)",
                lineHeight: 1.15,
                letterSpacing: "-0.03em",
                marginBottom: "20px",
                color: "var(--text-primary)",
              }}
            >
              Take commanding control of your wealth.
            </h1>
            <p style={{ fontSize: "16px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "36px" }}>
              Experience uncompromised financial privacy, exact decimal accounting, and multi-model consensus
              before taking major loans or commitments.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    color: "var(--accent-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Scale size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Hard Guardrail Checks</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Automatic mathematical warnings when debts or purchase outlays deplete your safe runway.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    color: "var(--success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Local-First Offline PWA</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Log transactions anywhere, anytime. Changes queue to IndexedDB and sync automatically.
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-color)",
                    color: "var(--warning)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>First User Is The Owner</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    The very first registration is granted platform ownership rights with zero setup hassle.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "40px" }}>
          © {new Date().getFullYear()} MoneyCouncil · Privacy-First Architecture
        </div>
      </div>

      {/* Right Form Panel */}
      <div
        style={{
          flex: "1 1 52%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
      >
        <div
          className="glass-panel"
          style={{
            maxWidth: "460px",
            width: "100%",
            padding: "40px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "22px",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 800,
                fontFamily: "var(--font-display)",
                color: "var(--text-primary)",
                marginBottom: "6px",
              }}
            >
              Create Account
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              First account is automatically the owner. Invite code optional for first user.
            </p>
          </div>

          {errors.general && (
            <div
              className="badge badge-danger"
              style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: "13px",
                display: "block",
                textAlign: "left",
              }}
            >
              {errors.general}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="input-group">
              <label className="input-label" htmlFor="register-email">
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="register-email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input-field"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  style={{
                    paddingLeft: "38px",
                    borderColor: errors.email ? "var(--danger)" : undefined,
                  }}
                />
                <Mail
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }}
                />
              </div>
              {errors.email && (
                <span style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>
                  {errors.email}
                </span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="register-password">
                Password (min 8 characters)
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  style={{
                    paddingLeft: "38px",
                    paddingRight: "46px",
                    borderColor: errors.password ? "var(--danger)" : undefined,
                  }}
                />
                <Lock
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "12px",
                    top: "10px",
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "4px",
                    display: "flex",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {password && (
                <div style={{ marginTop: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span style={{ color: "var(--text-muted)" }}>Strength:</span>
                    <span style={{ color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                  </div>
                  <div
                    style={{
                      height: "4px",
                      width: "100%",
                      borderRadius: "999px",
                      background: "var(--bg-surface-solid)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${(strength.score / 3) * 100}%`,
                        background: strength.color,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              )}

              {errors.password && (
                <span style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>
                  {errors.password}
                </span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="register-currency">
                Default Currency
              </label>
              <div style={{ position: "relative" }}>
                <select
                  id="register-currency"
                  className="input-field"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ paddingLeft: "38px" }}
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.label}
                    </option>
                  ))}
                </select>
                <Globe
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)", pointerEvents: "none" }}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="register-invite">
                Invite Code <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional for first user)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="register-invite"
                  type="text"
                  className="input-field"
                  placeholder="Leave empty if first account"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  style={{ paddingLeft: "38px" }}
                />
                <KeyRound
                  size={16}
                  style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              iconRight={<ArrowRight size={18} />}
              style={{ width: "100%", marginTop: "6px" }}
            >
              Complete Registration
            </Button>
          </form>

          {/* Switch to Login */}
          <div style={{ textAlign: "center", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
            <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Already registered?{" "}
            </span>
            <button
              type="button"
              onClick={onNavigateToLogin}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-primary)",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              Sign In Instead
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .auth-hero-panel {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
