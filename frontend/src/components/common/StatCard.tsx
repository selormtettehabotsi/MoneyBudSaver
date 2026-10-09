import React from "react";
import { Badge, BadgeVariant } from "./Badge";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: BadgeVariant;
  icon?: React.ReactNode;
  explanation?: string;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  badgeText,
  badgeVariant = "neutral",
  icon,
  explanation,
  onClick,
  className = "",
}) => {
  return (
    <div
      className={`glass-panel stat-card ${className}`.trim()}
      onClick={onClick}
      title={explanation}
      style={{
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: onClick ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.02em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        {icon && (
          <div
            style={{
              color: "var(--accent-primary)",
              background: "var(--bg-surface-solid)",
              padding: "6px",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
        <span
          className="tabular-nums stat-number"
          style={{
            fontSize: "clamp(1.5rem, 3.5vw, 1.875rem)",
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text-primary)",
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {badgeText && (
          <Badge variant={badgeVariant} size="sm">
            {badgeText}
          </Badge>
        )}
      </div>

      {(subtitle || explanation) && (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.4 }}>
          {subtitle || explanation}
        </div>
      )}
    </div>
  );
};
