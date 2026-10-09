import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode | React.ElementType;
  iconRight?: React.ReactNode | React.ElementType;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  isLoading = false,
  disabled = false,
  icon,
  iconRight,
  className = "",
  style,
  ...props
}) => {
  const isBusy = loading || isLoading;

  const variantClass = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost: "btn-ghost",
    danger: "btn-danger",
    success: "btn-success",
  }[variant];

  const sizeClass = {
    sm: "btn-sm",
    md: "",
    lg: "btn-lg",
  }[size];

  const renderIcon = (ic?: React.ReactNode | React.ElementType) => {
    if (!ic) return null;
    if (React.isValidElement(ic)) return ic;
    if (typeof ic === "function" || (typeof ic === "object" && ic !== null)) {
      const Comp = ic as React.ElementType;
      return <Comp size={size === "sm" ? 14 : size === "lg" ? 18 : 16} />;
    }
    return null;
  };

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      disabled={disabled || isBusy}
      style={style}
      {...props}
    >
      {isBusy ? (
        <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
      ) : (
        renderIcon(icon)
      )}
      {children}
      {!isBusy && renderIcon(iconRight)}
    </button>
  );
};
