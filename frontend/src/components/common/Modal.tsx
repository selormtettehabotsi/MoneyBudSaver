import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "520px",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Handle visualViewport for mobile virtual keyboard
  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;
    const handleResize = () => {
      const modalEl = document.querySelector(".modal-content") as HTMLElement;
      if (modalEl && window.visualViewport) {
        modalEl.style.maxHeight = `${Math.min(window.visualViewport.height * 0.9, window.innerHeight * 0.85)}px`;
      }
    };
    window.visualViewport.addEventListener("resize", handleResize);
    window.visualViewport.addEventListener("scroll", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("scroll", handleResize);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-content"
        style={{ maxWidth, maxHeight: "85dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Pill Handle */}
        <div className="modal-drag-handle" />

        <div className="modal-header">
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="btn-icon"
            style={{
              color: "var(--text-secondary)",
              minWidth: "44px",
              minHeight: "44px",
            }}
          >
            <X size={22} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
};
