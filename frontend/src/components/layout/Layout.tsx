import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";
import { ColdStartNotice } from "../common/ColdStartNotice";
import { QuickAddModal } from "../common/QuickAddModal";
import { Plus } from "lucide-react";

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  council: "Ask the AI Council",
  plan: "Financial Plan",
  budgets: "Budgets & Categories",
  goals: "Savings Goals",
  debts: "Debts & Loans",
  more: "More Menu",
  suggestions: "Smart Financial Review",
  data: "Data & Backups",
  settings: "Settings & AI Models",
};

export const Layout: React.FC<LayoutProps> = ({ currentPage, onNavigate, children }) => {
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const currentTitle = PAGE_TITLES[currentPage] || "MoneyCouncil";

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
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
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
          padding: "16px 24px 80px 24px",
          boxSizing: "border-box",
        }}
      >
        <Navbar currentPageTitle={currentTitle} />
        <main
          style={{
            flex: 1,
            marginTop: "8px",
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
        style={{
          display: "none", // Shown on mobile via CSS
          position: "fixed",
          bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
          right: "16px",
          width: "52px",
          height: "52px",
          minWidth: "52px",
          minHeight: "52px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)",
          color: "#ffffff",
          border: "none",
          boxShadow: "0 6px 20px rgba(99, 102, 241, 0.45)",
          cursor: "pointer",
          zIndex: 490,
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
      />

      {/* Mobile Bottom Navigation (5 tabs) */}
      <MobileNav currentPage={currentPage} onNavigate={onNavigate} />

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
            padding: 0 12px calc(140px + env(safe-area-inset-bottom, 0px)) 12px !important;
            max-width: 100vw !important;
            overflow-x: hidden !important;
          }
        }
        @media (max-width: 380px) {
          .main-viewport {
            padding: 0 8px calc(140px + env(safe-area-inset-bottom, 0px)) 8px !important;
          }
        }
      `}</style>
    </div>
  );
};

