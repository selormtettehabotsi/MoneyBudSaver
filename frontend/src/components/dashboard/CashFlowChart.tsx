import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { MonthlyTrendPoint } from "../../types/finance";
import { useCurrency } from "../../context/CurrencyContext";

interface CashFlowChartProps {
  trendData: MonthlyTrendPoint[];
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({ trendData }) => {
  const { formatMoney } = useCurrency();

  if (!trendData || trendData.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          height: "320px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
          No cash flow trend history available yet.
        </span>
      </div>
    );
  }

  // Format data for Recharts
  const chartData = trendData.map((d) => {
    const inc = parseFloat(d.income || "0");
    const exp = parseFloat(d.expense || "0");
    return {
      month: d.month_str,
      income: inc,
      expense: exp,
      net: inc - exp,
    };
  });

  // Custom accessible Tooltip showing Income, Expense, and Net
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div
          className="glass-panel"
          style={{
            padding: "12px 14px",
            background: "var(--bg-surface-solid)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-md)",
            fontSize: "12px",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "8px", color: "var(--text-primary)" }}>
            {label}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <span style={{ color: "var(--success)", fontWeight: 600 }}>Income:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>
                {formatMoney(dataPoint.income)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>Expense:</span>
              <span className="tabular-nums" style={{ fontWeight: 600 }}>
                {formatMoney(dataPoint.expense)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                borderTop: "1px solid var(--border-color)",
                paddingTop: "4px",
                marginTop: "2px",
              }}
            >
              <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Net Flow:</span>
              <span
                className="tabular-nums"
                style={{
                  fontWeight: 700,
                  color: dataPoint.net >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {dataPoint.net >= 0 ? "+" : ""}
                {formatMoney(dataPoint.net)}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-panel" style={{ padding: "20px 24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
            Monthly Cash Flow Trends
          </h3>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            6-Month Income vs Expense
          </span>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", fontWeight: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                background: "#10b981",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>Income</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "3px",
                background: "#ef4444",
              }}
            />
            <span style={{ color: "var(--text-secondary)" }}>Expense</span>
          </div>
        </div>
      </div>

      <div style={{ width: "100%", height: "230px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-muted)", fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
