import React from "react";
import { ShieldAlert } from "lucide-react";

export const DisclaimerBanner: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 16px",
        background: "rgba(99, 102, 241, 0.08)",
        border: "1px solid rgba(99, 102, 241, 0.2)",
        borderRadius: "var(--radius-md)",
        fontSize: "12px",
        color: "var(--text-secondary)",
        lineHeight: 1.4,
      }}
    >
      <ShieldAlert size={18} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
      <span>
        <strong>Notice:</strong> AI Council evaluations and insights are generated for deliberation support and do not constitute certified financial advice. You retain final decision authority.
      </span>
    </div>
  );
};
