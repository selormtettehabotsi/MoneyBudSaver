import React from "react";
import { useCurrency } from "../../context/CurrencyContext";

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  value: string | number;
  onChange: (val: string) => void;
  currencySymbol?: string;
  label?: string;
  error?: string;
}

export const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onChange,
  currencySymbol,
  label,
  error,
  placeholder = "0.00",
  id,
  className = "",
  style,
  ...props
}) => {
  const { symbol } = useCurrency();
  const activeSymbol = currencySymbol ?? symbol;
  const inputId = id || `money-input-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <div className={`input-group ${className}`.trim()} style={style}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "14px",
            color: "var(--text-muted)",
            fontWeight: 600,
            fontSize: "1rem",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {activeSymbol}
        </span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]*"
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            // Allow only numbers and a single decimal point
            if (/^\d*\.?\d*$/.test(val)) {
              onChange(val);
            }
          }}
          placeholder={placeholder}
          className="input-field tabular-nums"
          style={{
            paddingLeft: `${activeSymbol.length * 10 + 20}px`,
            fontWeight: 600,
            fontSize: "1.0625rem",
            letterSpacing: "0.02em",
          }}
          {...props}
        />
      </div>
      {error && (
        <span style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>
          {error}
        </span>
      )}
    </div>
  );
};
