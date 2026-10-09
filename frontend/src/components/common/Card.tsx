import React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  glow?: boolean;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  headerAction,
  footer,
  glow = false,
  interactive = false,
  className = "",
  style,
  ...props
}) => {
  return (
    <div
      className={`glass-panel ${glow ? "glass-panel-glow" : ""} ${className}`.trim()}
      style={{
        padding: "var(--space-card-pad)",
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        cursor: interactive ? "pointer" : undefined,
        ...style,
      }}
      {...props}
    >
      {(title || headerAction) && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            {title && (
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginTop: "4px",
                  lineHeight: 1.4,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}

      {children}

      {footer && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "14px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
