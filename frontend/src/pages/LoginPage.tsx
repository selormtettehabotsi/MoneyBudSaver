import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Lock, Mail, ArrowRight, Eye, EyeOff } from "lucide-react";

interface LoginPageProps {
  onNavigateToRegister: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 60%), var(--bg-primary)",
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: "420px",
          width: "100%",
          padding: "36px 32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }} className="flex flex-col items-center gap-2">
          <img src="/favicon.svg" alt="Logo" style={{ width: "48px", height: "48px" }} />
          <h1 style={{ fontSize: "24px", marginTop: "8px" }}>Sign In to MoneyCouncil</h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Privacy-First Multi-AI Financial Management
          </p>
        </div>

        {error && (
          <div className="badge-danger" style={{ padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <div style={{ position: "relative" }}>
              <input
                type="email"
                required
                className="input-field"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ paddingLeft: "38px" }}
              />
              <Mail size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }} />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: "38px", paddingRight: "46px" }}
              />
              <Lock size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)", pointerEvents: "none" }} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="btn-icon"
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  width: "44px",
                  height: "44px",
                  minWidth: "44px",
                  minHeight: "44px",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "8px", minHeight: "44px" }}
          >
            <span>{loading ? "Signing in..." : "Sign In"}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Switch to Register */}
        <div style={{ textAlign: "center", fontSize: "0.875rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", flexWrap: "wrap" }}>
          <span>Don't have an account yet?</span>
          <button
            type="button"
            onClick={onNavigateToRegister}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-primary)",
              fontWeight: 600,
              cursor: "pointer",
              minHeight: "44px",
              minWidth: "44px",
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 8px",
            }}
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
};
