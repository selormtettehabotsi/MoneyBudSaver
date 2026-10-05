import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Lock, Mail, KeyRound, Globe, ArrowRight } from "lucide-react";

interface RegisterPageProps {
  onNavigateToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigateToLogin }) => {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [currency, setCurrency] = useState("GHS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password, inviteCode || undefined, currency);
    } catch (err: any) {
      setError(err.message || "Registration failed.");
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
          maxWidth: "440px",
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
          <h1 style={{ fontSize: "24px", marginTop: "8px" }}>Get Started with MoneyCouncil</h1>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            First account is automatically the owner.
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
            <label className="input-label">Password (Min 8 chars, max 72 bytes)</label>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                required
                minLength={8}
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingLeft: "38px" }}
              />
              <Lock size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }} />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Default Currency</label>
            <div style={{ position: "relative" }}>
              <select
                className="input-field"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{ paddingLeft: "38px" }}
              >
                <option value="GHS">GHS (GH₵) - Ghana Cedi</option>
                <option value="USD">USD ($) - US Dollar</option>
                <option value="EUR">EUR (€) - Euro</option>
                <option value="GBP">GBP (£) - British Pound</option>
                <option value="NGN">NGN (₦) - Nigerian Naira</option>
                <option value="KES">KES (KSh) - Kenyan Shilling</option>
                <option value="ZAR">ZAR (R) - South African Rand</option>
              </select>
              <Globe size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }} />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Invite Code (Optional for first user)</label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="input-field"
                placeholder="Enter invite code if not 1st user"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                style={{ paddingLeft: "38px" }}
              />
              <KeyRound size={16} style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-muted)" }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", marginTop: "8px" }}
          >
            <span>{loading ? "Creating account..." : "Create Account"}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Switch to Login */}
        <div style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
          Already have an account?{" "}
          <button
            onClick={onNavigateToLogin}
            style={{ background: "none", border: "none", color: "var(--accent-primary)", fontWeight: 600, cursor: "pointer" }}
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
