import React from "react";

export interface SegmentOption<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  fullWidth = false,
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      className={`segmented-control ${className}`.trim()}
      style={{
        display: "inline-flex",
        background: "var(--bg-surface-solid)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "4px",
        gap: "4px",
        width: fullWidth ? "100%" : "auto",
        maxWidth: "100%",
        overflowX: "auto",
        boxSizing: "border-box",
      }}
    >
      {options.map((opt) => {
        const isSelected = value === opt.id;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isSelected}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              flex: fullWidth ? 1 : "initial",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: size === "sm" ? "6px 12px" : "8px 16px",
              fontSize: size === "sm" ? "13px" : "14px",
              fontWeight: isSelected ? 600 : 500,
              borderRadius: "calc(var(--radius-md) - 3px)",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease",
              background: isSelected ? "var(--bg-surface)" : "transparent",
              color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: isSelected ? "var(--shadow-sm)" : "none",
              whiteSpace: "nowrap",
              minHeight: "36px",
            }}
          >
            {opt.icon}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                style={{
                  fontSize: "11px",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  background: isSelected ? "var(--accent-primary-glow)" : "var(--bg-input)",
                  color: isSelected ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: 700,
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
