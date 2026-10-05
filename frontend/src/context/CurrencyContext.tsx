import React, { createContext, useContext, useState } from "react";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GHS: "GH₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  NGN: "₦",
  KES: "KSh",
  ZAR: "R",
  CAD: "CA$",
  AUD: "A$",
  INR: "₹",
};

interface CurrencyContextType {
  currency: string;
  symbol: string;
  setCurrency: (code: string) => void;
  formatMoney: (amount: string | number | undefined | null) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>("GHS");

  const setCurrency = (code: string) => {
    setCurrencyState(code.toUpperCase());
  };

  const symbol = CURRENCY_SYMBOLS[currency] || currency;

  const formatMoney = (amount: string | number | undefined | null): string => {
    if (amount === undefined || amount === null) return `${symbol} 0.00`;
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return `${symbol} 0.00`;

    const formatted = num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${symbol} ${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, symbol, setCurrency, formatMoney }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within a CurrencyProvider");
  return context;
};
