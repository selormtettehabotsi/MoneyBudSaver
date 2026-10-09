import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Lock, Mail, ArrowRight, Eye, EyeOff, ShieldCheck, Scale, Sparkles } from "lucide-react";
import { Button } from "../components/common/Button";

interface LoginPageProps {
  onNavigateToRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToRegister }) => {
  const { login } = useAuth();
  const { error: toastError } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errs.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errs.email = "Please enter a valid email address";
    }
    if (!password) {
      errs.password = "Password is required";
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
      await login(email, password);
    } catch (err: any) {
      const msg = err.message || "Invalid email or password.";
      setErrors({ general: msg });
      toastError(msg, "Sign In Failed");
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
                PRIVACY-FIRST FINANCIAL ADVISOR
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
              Ensemble AI council for your financial freedom.
            </h1>
            <p style={{ fontSize: "16px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "36px" }}>
              Multiple distinct AI model families debate, deliberate, and vote on your financial decisions
              with mathematical guardrails you control.
            </p>

            {/* Feature Highlights */}
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
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>2-Round AI Deliberation</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Independent blind voting followed by peer debate across Google Gemini, Groq, and OpenRouter.
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
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Strict PII Anonymization</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Personal identifying data is scrubbed before reaching external LLMs. You retain complete ownership.
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
                    color: "var(--accent-purple)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "3px" }}>Automated Smart Audits</h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    0–100 health score analyzing savings rate, debt safety, and monthly budget discipline.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "40px" }}>
          © {new Date().getFullYear()} MoneyCouncil · Privacy-First Local Architecture
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
        }}
      >
        <div
          className="glass-panel"
          style={{
            maxWidth: "440px",
            width: "100%",
            padding: "40px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
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
              Sign In
            </h2>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Welcome back! Access your financial dashboard and deliberation records.
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
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div className="input-group">
              <label className="input-label" htmlFor="login-email">
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-email"
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="input-label" htmlFor="login-password">
                  Password
                </label>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
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
              {errors.password && (
                <span style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>
                  {errors.password}
                </span>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              iconRight={<ArrowRight size={18} />}
              style={{ width: "100%", marginTop: "6px" }}
            >
              Sign In to Dashboard
            </Button>
          </form>

          {/* Switch to Register */}
          <div style={{ textAlign: "center", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
            <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Don't have an account?{" "}
            </span>
            <button
              type="button"
              onClick={onNavigateToRegister}
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
              Create Account
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
