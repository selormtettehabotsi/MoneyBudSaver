import React, { useState, useEffect, useCallback } from "react";
import { usePinLock } from "../../context/PinLockContext";
import { useAuth } from "../../context/AuthContext";
import { useConfirm } from "../../context/ConfirmDialogContext";
import { Lock, Delete, LogOut } from "lucide-react";

export const PinLockScreen: React.FC = () => {
  const { isLocked, unlock } = usePinLock();
  const { logout } = useAuth();
  const { confirm } = useConfirm();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (isLocked) {
      setPin("");
      setError(null);
    }
  }, [isLocked]);

  const attemptUnlock = useCallback(
    async (candidatePin: string) => {
      const success = await unlock(candidatePin);
      if (!success) {
        if (candidatePin.length >= 4) {
          setError("Incorrect PIN. Please try again.");
          setShaking(true);
          setTimeout(() => {
            setShaking(false);
            setPin("");
          }, 450);
        }
      }
    },
    [unlock]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < 8) {
        const nextPin = pin + digit;
        setPin(nextPin);
        setError(null);
        if (nextPin.length >= 4) {
          attemptUnlock(nextPin);
        }
      }
    },
    [pin, attemptUnlock]
  );

  const handleDelete = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setPin("");
    setError(null);
  }, []);

  // Physical keyboard support
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, handleDigit, handleDelete, handleClear]);

  if (!isLocked) return null;

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: "Log out of MoneyCouncil?",
      message: "Your cached offline financial data on this device will be cleared and you will need to sign in again.",
      confirmText: "Log Out",
      cancelText: "Cancel",
      isDanger: true,
    });
    if (confirmed) {
      await logout();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Application PIN Lock Screen"
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
          maxWidth: "360px",
          width: "100%",
          padding: "36px 28px",
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
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: "var(--accent-primary-glow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--accent-primary)",
          }}
        >
          <Lock size={30} />
        </div>

        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, fontFamily: "var(--font-display)" }}>
            MoneyCouncil Locked
          </h2>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px", display: "block" }}>
            Enter your security PIN or use your keyboard
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
            className="badge badge-danger"
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
              fontSize: "13px",
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
          className="btn btn-ghost btn-sm"
          style={{
            color: "var(--text-muted)",
            fontSize: "13px",
            marginTop: "8px",
            gap: "6px",
          }}
        >
          <LogOut size={14} />
          <span>Forgot PIN? Log Out & Re-sync</span>
        </button>
      </div>
    </div>
  );
};
