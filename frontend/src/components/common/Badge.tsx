import React from "react";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  size = "md",
  icon,
  className = "",
  style,
}) => {
  const variantClass = {
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    neutral: "badge-neutral",
    brand: "badge-brand",
  }[variant];

  return (
    <span
      className={`badge ${variantClass} ${className}`.trim()}
      style={{
        padding: size === "sm" ? "2px 6px" : "4px 10px",
        fontSize: size === "sm" ? "11px" : "12px",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontWeight: 600,
        borderRadius: "999px",
        lineHeight: 1.2,
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
};
