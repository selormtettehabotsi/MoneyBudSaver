import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", title?: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, title?: string) => addToast(message, "success", title), [addToast]);
  const error = useCallback((message: string, title?: string) => addToast(message, "error", title, 5000), [addToast]);
  const warning = useCallback((message: string, title?: string) => addToast(message, "warning", title, 4500), [addToast]);
  const info = useCallback((message: string, title?: string) => addToast(message, "info", title), [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, warning, info, removeToast }}>
      {children}
      {/* Toast Render Container */}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          maxWidth: "420px",
          width: "calc(100vw - 32px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => {
          const bgMap = {
            success: "var(--bg-surface-solid)",
            error: "var(--bg-surface-solid)",
            warning: "var(--bg-surface-solid)",
            info: "var(--bg-surface-solid)",
          };
          const borderMap = {
            success: "var(--success-border)",
            error: "var(--danger-border)",
            warning: "var(--warning-border)",
            info: "var(--accent-primary-glow)",
          };
          const iconMap = {
            success: <CheckCircle2 size={18} style={{ color: "var(--success)", flexShrink: 0 }} />,
            error: <AlertCircle size={18} style={{ color: "var(--danger)", flexShrink: 0 }} />,
            warning: <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0 }} />,
            info: <Info size={18} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />,
          };

          return (
            <div
              key={t.id}
              role="alert"
              style={{
                pointerEvents: "auto",
                background: bgMap[t.type],
                border: `1px solid ${borderMap[t.type]}`,
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                padding: "12px 16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                animation: "scaleUp 0.18s ease-out",
                backdropFilter: "blur(12px)",
              }}
            >
              {iconMap[t.type]}
              <div style={{ flex: 1, minWidth: 0 }}>
                {t.title && (
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)", marginBottom: "2px" }}>
                    {t.title}
                  </div>
                )}
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  {t.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeToast(t.id)}
                aria-label="Close notification"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "2px",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "24px",
                  minHeight: "24px",
                }}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
