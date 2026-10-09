import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";
import { ColdStartNotice } from "../common/ColdStartNotice";
import { QuickAddModal } from "../common/QuickAddModal";
import { Plus } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/transactions": "Transactions",
  "/council": "Ask the Council",
  "/plan": "Financial Plan",
  "/plan/budgets": "Budgets & Categories",
  "/plan/goals": "Savings Goals",
  "/plan/debts": "Debts & Loans",
  "/more": "More Menu",
  "/review": "Smart Financial Review",
  "/suggestions": "Smart Financial Review",
  "/data": "Data & Backups",
  "/settings": "Settings & Security",
};

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const location = useLocation();

  const getTitle = () => {
    if (location.pathname.startsWith("/council/")) return "Deliberation Details";
    return PAGE_TITLES[location.pathname] || "MoneyCouncil";
  };

  // Keyboard shortcut: Press 'N' to open Quick Add (unless typing in input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "n" || e.key === "N") &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        const target = e.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable;
        if (!isInput) {
          e.preventDefault();
          setIsQuickAddOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="app-container"
      style={{
        display: "flex",
        minHeight: "100dvh",
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
      }}
    >
      <ColdStartNotice />

      {/* Desktop Sidebar */}
      <div className="desktop-sidebar-container">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div
        className="main-viewport"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          padding: "16px 28px 80px 28px",
          boxSizing: "border-box",
        }}
      >
        <Navbar
          currentPageTitle={getTitle()}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        />
        <main
          style={{
            flex: 1,
            width: "100%",
            maxWidth: "1280px",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {children}
        </main>
      </div>

      {/* Floating '+' Button for Mobile Quick Add */}
      <button
        onClick={() => setIsQuickAddOpen(true)}
        className="mobile-fab-btn"
        aria-label="Quick Add Transaction"
        title="Quick Add Transaction"
        style={{
          display: "none",
          position: "fixed",
          bottom: "calc(74px + env(safe-area-inset-bottom, 0px))",
          right: "20px",
          width: "52px",
          height: "52px",
          minWidth: "52px",
          minHeight: "52px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 6px 22px rgba(99, 102, 241, 0.45)",
          cursor: "pointer",
          zIndex: 490,
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
      />

      {/* Mobile Bottom Navigation (5 tabs) */}
      <MobileNav />

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar-container {
            display: none !important;
          }
          .mobile-header {
            display: flex !important;
          }
          .mobile-bottom-nav {
            display: flex !important;
          }
          .mobile-fab-btn {
            display: flex !important;
          }
          .main-viewport {
            padding: 0 14px calc(140px + env(safe-area-inset-bottom, 0px)) 14px !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
        }
        @media (max-width: 380px) {
          .main-viewport {
            padding: 0 10px calc(140px + env(safe-area-inset-bottom, 0px)) 10px !important;
          }
        }
      `}</style>
    </div>
  );
};
