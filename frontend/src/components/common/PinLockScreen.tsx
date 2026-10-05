import React, { useState, useEffect } from "react";
import { usePinLock } from "../../context/PinLockContext";
import { useAuth } from "../../context/AuthContext";
import { Lock, Delete, LogOut } from "lucide-react";

export const PinLockScreen: React.FC = () => {
  const { isLocked, unlock } = usePinLock();
  const { logout } = useAuth();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (isLocked) {
      setPin("");
      setError(null);
    }
  }, [isLocked]);

  if (!isLocked) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      if (nextPin.length >= 4) {
        // Auto-check on 4 or 6 digits
        attemptUnlock(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin("");
    setError(null);
  };

  const attemptUnlock = async (candidatePin: string) => {
    const success = await unlock(candidatePin);
    if (!success) {
      if (candidatePin.length >= 4) {
        setError("Incorrect PIN. Please try again.");
        setShaking(true);
        setTimeout(() => {
          setShaking(false);
          setPin("");
        }, 500);
      }
    }
  };

  const handleLogout = async () => {
    const confirmed = window.confirm("Log out of MoneyCouncil? Your cached offline data will be cleared.");
    if (confirmed) {
      await logout();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        userSelect: "none",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: "340px",
          width: "100%",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "rgba(99, 102, 241, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-primary)",
          }}
        >
          <Lock size={28} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700 }}>MoneyCouncil Locked</h2>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Enter your security PIN to unlock financial records
          </span>
        </div>

        {/* PIN Dot Indicators */}
        <div
          className={`flex items-center justify-center gap-3 ${shaking ? "animate-shake" : ""}`}
          style={{ margin: "8px 0" }}
        >
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                style={{
                  width: "14px",
                  height: "14px",
                  borderRadius: "50%",
                  border: "2px solid var(--accent-primary)",
                  background: isFilled ? "var(--accent-primary)" : "transparent",
                  transition: "all 0.15s ease",
                  transform: isFilled ? "scale(1.15)" : "scale(1)",
                }}
              />
            );
          })}
        </div>

        {error && (
          <div
            className="badge-danger"
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* Keypad */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
            width: "100%",
            marginTop: "8px",
          }}
        >
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="btn btn-secondary"
              style={{
                height: "52px",
                fontSize: "20px",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="btn btn-ghost"
            style={{
              height: "52px",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="btn btn-secondary"
            style={{
              height: "52px",
              fontSize: "20px",
              fontWeight: 600,
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            aria-label="Delete last digit"
            className="btn btn-ghost"
            style={{
              height: "52px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
            }}
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Logout Fallback */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            cursor: "pointer",
            marginTop: "8px",
            minHeight: "44px",
            minWidth: "44px",
            padding: "8px 12px",
            justifyContent: "center",
          }}
        >
          <LogOut size={15} />
          <span>Forgot PIN? Log Out & Re-sync</span>
        </button>
      </div>
    </div>
  );
};
