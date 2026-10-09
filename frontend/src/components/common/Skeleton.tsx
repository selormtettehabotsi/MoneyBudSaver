import React from "react";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-sm)",
  className = "",
  style,
}) => {
  return (
    <div
      className={`skeleton-loader ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, var(--bg-surface-solid) 25%, var(--bg-surface-hover) 50%, var(--bg-surface-solid) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.6s infinite ease-in-out",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
};

export const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 3 }) => {
  return (
    <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <Skeleton height="24px" width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height="16px" width={i === rows - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
};
