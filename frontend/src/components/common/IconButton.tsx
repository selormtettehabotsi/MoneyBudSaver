import React from "react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  variant?: "ghost" | "secondary" | "danger" | "primary";
  size?: "sm" | "md" | "lg";
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className = "",
  style,
  ...props
}) => {
  const sizeStyles = {
    sm: { width: "36px", height: "36px", minWidth: "36px", minHeight: "36px" },
    md: { width: "44px", height: "44px", minWidth: "44px", minHeight: "44px" },
    lg: { width: "48px", height: "48px", minWidth: "48px", minHeight: "48px" },
  }[size];

  return (
    <button
      type="button"
      className={`btn-icon ${variant === "secondary" ? "btn-secondary" : ""} ${className}`.trim()}
      aria-label={label}
      title={label}
      style={{ ...sizeStyles, ...style }}
      {...props}
    >
      {icon}
    </button>
  );
};
