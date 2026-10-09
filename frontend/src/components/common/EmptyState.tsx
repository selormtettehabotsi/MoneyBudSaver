import React from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className = "",
}) => {
  return (
    <div
      className={`glass-panel empty-state ${className}`.trim()}
      style={{
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        maxWidth: "540px",
        margin: "24px auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "50%",
          background: "var(--bg-surface-solid)",
          border: "1px solid var(--border-color)",
          color: "var(--accent-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
        }}
      >
        {icon}
      </div>

      <h3
        style={{
          fontSize: "18px",
          fontWeight: 700,
          color: "var(--text-primary)",
          marginBottom: "8px",
          fontFamily: "var(--font-display)",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontSize: "14px",
          color: "var(--text-secondary)",
          maxWidth: "380px",
          lineHeight: 1.5,
          marginBottom: actionLabel ? "20px" : "0",
        }}
      >
        {description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="secondary" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
