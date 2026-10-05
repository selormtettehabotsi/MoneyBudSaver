import React from "react";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { MobileNav } from "./MobileNav";
import { ColdStartNotice } from "../common/ColdStartNotice";

interface LayoutProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  budgets: "Budgets & Categories",
  goals: "Savings Goals",
  debts: "Debts & Loans",
  council: "Ask the AI Council",
  suggestions: "Smart Financial Review",
  settings: "Settings & AI Models",
};

export const Layout: React.FC<LayoutProps> = ({ currentPage, onNavigate, children }) => {
  const currentTitle = PAGE_TITLES[currentPage] || "MoneyCouncil";

  return (
    <div className="app-container" style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
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
          padding: "16px 24px 80px 24px",
        }}
      >
        <Navbar currentPageTitle={currentTitle} />
        <main style={{ flex: 1, marginTop: "8px", width: "100%", maxWidth: "1280px", margin: "0 auto" }}>
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
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
          .main-viewport {
            padding: 8px 12px 90px 12px !important;
          }
        }
      `}</style>
    </div>
  );
};
