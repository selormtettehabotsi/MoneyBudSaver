import React, { useState } from "react";
import { MonthlyTrendPoint } from "../../types/finance";
import { useCurrency } from "../../context/CurrencyContext";

interface CashFlowChartProps {
  trendData: MonthlyTrendPoint[];
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({ trendData }) => {
  const { formatMoney } = useCurrency();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!trendData || trendData.length === 0) {
    return (
      <div className="glass-panel flex items-center justify-center" style={{ height: "280px" }}>
        <span style={{ color: "var(--text-muted)" }}>No trend history available yet.</span>
      </div>
    );
  }

  // Find max value to scale chart height
  const maxVal = Math.max(
    ...trendData.flatMap((d) => [parseFloat(d.income || "0"), parseFloat(d.expense || "0")]),
    100
  );

  const chartHeight = 160;
  const chartWidth = 500;
  const barWidth = 18;
  const groupSpacing = chartWidth / trendData.length;

  return (
    <div className="glass-panel" style={{ padding: "18px 20px", position: "relative" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h3 style={{ fontSize: "16px" }}>Monthly Cash Flow Trends</h3>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Last 6 Months Income vs Expense</span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3" style={{ fontSize: "12px", fontWeight: 600, flexWrap: "wrap" }}>
          <div className="flex items-center gap-1.5">
            <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--success)" }} />
            <span style={{ color: "var(--text-secondary)" }}>Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--danger)" }} />
            <span style={{ color: "var(--text-secondary)" }}>Expense</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}
          style={{ width: "100%", height: "210px", overflow: "visible" }}
        >
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <line
              key={i}
              x1="0"
              y1={chartHeight * (1 - pct)}
              x2={chartWidth}
              y2={chartHeight * (1 - pct)}
              stroke="var(--border-color)"
              strokeDasharray="3,3"
            />
          ))}

          {/* Bars */}
          {trendData.map((d, index) => {
            const inc = parseFloat(d.income || "0");
            const exp = parseFloat(d.expense || "0");

            const incHeight = maxVal > 0 ? (inc / maxVal) * chartHeight : 0;
            const expHeight = maxVal > 0 ? (exp / maxVal) * chartHeight : 0;

            const groupX = index * groupSpacing + groupSpacing / 2;
            const incX = groupX - barWidth - 2;
            const expX = groupX + 2;

            const isHovered = hoveredIndex === index;

            return (
              <g
                key={d.month_str}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Income Bar */}
                <rect
                  x={incX}
                  y={chartHeight - incHeight}
                  width={barWidth}
                  height={incHeight}
                  rx="4"
                  fill="url(#incomeGrad)"
                  opacity={isHovered ? 1 : 0.85}
                  style={{ transition: "all 0.2s ease" }}
                />

                {/* Expense Bar */}
                <rect
                  x={expX}
                  y={chartHeight - expHeight}
                  width={barWidth}
                  height={expHeight}
                  rx="4"
                  fill="url(#expenseGrad)"
                  opacity={isHovered ? 1 : 0.85}
                  style={{ transition: "all 0.2s ease" }}
                />

                {/* Month Label */}
                <text
                  x={groupX}
                  y={chartHeight + 22}
                  textAnchor="middle"
                  fill={isHovered ? "var(--accent-primary)" : "var(--text-muted)"}
                  fontSize="11"
                  fontWeight={isHovered ? "700" : "500"}
                >
                  {d.month_str.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredIndex !== null && trendData[hoveredIndex] && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "24px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            padding: "8px 14px",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            fontSize: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "3px",
            animation: "fadeIn 0.15s ease",
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>{trendData[hoveredIndex].month_str}</strong>
          <span style={{ color: "var(--success)" }}>
            Income: {formatMoney(trendData[hoveredIndex].income)}
          </span>
          <span style={{ color: "var(--danger)" }}>
            Expense: {formatMoney(trendData[hoveredIndex].expense)}
          </span>
          <span style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border-color)", paddingTop: "3px" }}>
            Net: {formatMoney(trendData[hoveredIndex].net_savings)}
          </span>
        </div>
      )}
    </div>
  );
};
