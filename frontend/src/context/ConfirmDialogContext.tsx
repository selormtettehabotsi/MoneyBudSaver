import React, { createContext, useContext, useState, useRef, useCallback } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

interface ConfirmDialogContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | undefined>(undefined);

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const handleClose = (value: boolean) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
    setOptions(null);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (options && e.key === "Escape") {
        handleClose(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [options]);

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div
          className="modal-overlay"
          onClick={() => handleClose(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "440px" }}
          >
            <div className="modal-body" style={{ padding: "24px 20px" }}>
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: options.isDanger ? "var(--danger-bg)" : "var(--accent-primary-glow)",
                    color: options.isDanger ? "var(--danger)" : "var(--accent-primary)",
                  }}
                >
                  {options.isDanger ? <AlertTriangle size={22} /> : <HelpCircle size={22} />}
                </div>
                <div style={{ flex: 1 }}>
                  <h3
                    id="confirm-dialog-title"
                    style={{ fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "var(--text-primary)" }}
                  >
                    {options.title}
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {options.message}
                  </p>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ background: "transparent" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleClose(false)}
                autoFocus
              >
                {options.cancelText || "Cancel"}
              </button>
              <button
                type="button"
                className={`btn ${options.isDanger ? "btn-danger" : "btn-primary"}`}
                onClick={() => handleClose(true)}
              >
                {options.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmDialogProvider");
  }
  return context;
};
