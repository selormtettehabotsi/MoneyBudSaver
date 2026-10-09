import React from "react";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  className = "",
}) => {
  return (
    <div
      className={`page-header ${className}`.trim()}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
        marginBottom: "24px",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h1
            style={{
              fontSize: "clamp(1.5rem, 3.8vw, 1.875rem)",
              fontWeight: 800,
              fontFamily: "var(--font-display)",
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-secondary)",
              marginTop: "4px",
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
};
