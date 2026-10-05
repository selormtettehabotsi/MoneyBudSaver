import React, { useState, useRef } from "react";
import {
  downloadTransactionsCsv,
  downloadBudgetsCsv,
  downloadDebtsCsv,
  downloadFullBackupJson,
  importTransactionsCsv,
  restoreFullBackupJson,
  ImportCsvResponse,
  RestoreBackupResponse,
} from "../api/data";
import { useSync } from "../context/SyncContext";
import {
  Database,
  Upload,
  Download,
  FileSpreadsheet,
  Check,
  AlertCircle,
  RefreshCw,
  Layers,
} from "lucide-react";

export const DataPage: React.FC = () => {
  const { isOnline } = useSync();
  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [createMissingCats, setCreateMissingCats] = useState(true);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportCsvResponse | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // JSON Restore State
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [overwriteRestore, setOverwriteRestore] = useState(false);
  const [jsonRestoring, setJsonRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreBackupResponse | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvError(null);
    setCsvResult(null);

    try {
      const res = await importTransactionsCsv(csvFile, createMissingCats);
      setCsvResult(res);
      setCsvFile(null);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch (err: any) {
      setCsvError(err.message || "Failed to import CSV statement.");
    } finally {
      setCsvImporting(false);
    }
  };

  const handleJsonRestore = async () => {
    if (!jsonFile) return;
    if (overwriteRestore) {
      const confirmWipe = window.confirm(
        "WARNING: You have selected 'Overwrite Existing Data'. This will completely replace your current transactions, budgets, debts, goals, and council records with the backup file. Proceed?"
      );
      if (!confirmWipe) return;
    }

    setJsonRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const res = await restoreFullBackupJson(jsonFile, overwriteRestore);
      setRestoreResult(res);
      setJsonFile(null);
      if (jsonInputRef.current) jsonInputRef.current.value = "";
    } catch (err: any) {
      setRestoreError(err.message || "Failed to restore database from backup.");
    } finally {
      setJsonRestoring(false);
    }
  };

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: "24px", marginBottom: "4px" }}>Data & Disaster Recovery</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
          Export CSV records, import bank / mobile money statements, and manage full portable JSON snapshots.
        </p>
      </div>

      {/* 1. CSV Statement Import */}
      <div className="glass-panel" style={{ padding: "20px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "14px" }}>
          <Upload size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: "17px" }}>Import CSV Statements</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Import transactions from mobile money (MTN, Telecel, M-Pesa) or bank CSV statements with fuzzy header matching and duplicate prevention.
        </p>

        {!isOnline && (
          <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "12px" }}>
            <AlertCircle size={14} />
            <span>CSV import requires an active internet connection.</span>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="input-field"
              disabled={!isOnline}
              style={{ flex: 1, minHeight: "44px" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setCsvFile(e.target.files[0]);
                  setCsvResult(null);
                  setCsvError(null);
                }
              }}
            />

            <button
              type="button"
              disabled={!isOnline || !csvFile || csvImporting}
              onClick={handleCsvImport}
              className="btn btn-primary flex items-center justify-center gap-2"
              style={{ minHeight: "44px" }}
            >
              {csvImporting ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{csvImporting ? "Importing..." : "Upload & Parse"}</span>
            </button>
          </div>

          <label className="flex items-center gap-2" style={{ fontSize: "13px", cursor: "pointer", color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              disabled={!isOnline}
              checked={createMissingCats}
              onChange={(e) => setCreateMissingCats(e.target.checked)}
            />
            <span>Automatically create categories discovered in CSV if missing</span>
          </label>

          {csvError && (
            <div className="badge-danger flex items-center gap-2" style={{ padding: "12px 16px", borderRadius: "var(--radius-md)" }}>
              <AlertCircle size={16} />
              <span>{csvError}</span>
            </div>
          )}

          {csvResult && (
            <div
              className="badge-success flex flex-col gap-1"
              style={{ padding: "14px 16px", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.1)" }}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Check size={16} />
                <span>Import Complete!</span>
              </div>
              <div style={{ fontSize: "12px" }}>
                Imported: <strong>{csvResult.imported_count}</strong> transactions • Skipped Duplicates: <strong>{csvResult.skipped_duplicates}</strong> • Categories Created: <strong>{csvResult.created_categories}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. CSV Data Exports */}
      <div className="glass-panel" style={{ padding: "20px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "14px" }}>
          <FileSpreadsheet size={20} style={{ color: "var(--accent-secondary)" }} />
          <h3 style={{ fontSize: "17px" }}>Export Data to CSV</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Download clean spreadsheets of your financial history for offline analysis in Excel or Google Sheets.
        </p>

        {!isOnline && (
          <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "12px" }}>
            <AlertCircle size={14} />
            <span>Exporting CSV data from server requires an active connection.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadTransactionsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Transactions CSV</span>
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadBudgetsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Budgets CSV</span>
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={downloadDebtsCsv}
            className="btn btn-secondary flex items-center justify-center gap-2"
            style={{ minHeight: "44px" }}
          >
            <Download size={16} />
            <span>Debts CSV</span>
          </button>
        </div>
      </div>

      {/* 3. Full Database Backup & Restore (JSON) */}
      <div className="glass-panel" style={{ padding: "20px" }}>
        <div className="flex items-center gap-2" style={{ marginBottom: "14px" }}>
          <Database size={20} style={{ color: "var(--accent-purple)" }} />
          <h3 style={{ fontSize: "17px" }}>Full Database Snapshot & Restore (JSON)</h3>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
          Export or restore a complete portable snapshot of your entire database: transactions, budgets, goals, debts, and AI Council history.
        </p>

        {!isOnline && (
          <div className="badge-warning flex items-center gap-2" style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: "14px", fontSize: "12px" }}>
            <AlertCircle size={14} />
            <span>Database backup and cloud restore require an active internet connection.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Backup Export */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div>
              <strong>Export Full Snapshot</strong>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Download complete JSON snapshot to your device.
              </div>
            </div>
            <button
              type="button"
              disabled={!isOnline}
              onClick={downloadFullBackupJson}
              className="btn btn-secondary flex items-center justify-center gap-2"
              style={{ minHeight: "44px", marginTop: "auto" }}
            >
              <Download size={16} />
              <span>Download Backup (.json)</span>
            </button>
          </div>

          {/* Backup Restore */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div>
              <strong>Restore From Backup</strong>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Restore or merge a previously exported JSON backup.
              </div>
            </div>

            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              className="input-field"
              disabled={!isOnline}
              style={{ minHeight: "44px" }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setJsonFile(e.target.files[0]);
                  setRestoreResult(null);
                  setRestoreError(null);
                }
              }}
            />

            <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                disabled={!isOnline}
                checked={overwriteRestore}
                onChange={(e) => setOverwriteRestore(e.target.checked)}
              />
              <span style={{ color: overwriteRestore ? "var(--danger)" : "inherit" }}>
                Overwrite existing records (wipe & replace)
              </span>
            </label>

            <button
              type="button"
              disabled={!isOnline || !jsonFile || jsonRestoring}
              onClick={handleJsonRestore}
              className="btn btn-primary flex items-center justify-center gap-2"
              style={{ minHeight: "44px", marginTop: "auto" }}
            >
              {jsonRestoring ? <RefreshCw size={16} className="animate-spin" /> : <Layers size={16} />}
              <span>{jsonRestoring ? "Restoring..." : "Restore Database"}</span>
            </button>
          </div>
        </div>

        {restoreError && (
          <div className="badge-danger flex items-center gap-2" style={{ padding: "12px 16px", marginTop: "14px", borderRadius: "var(--radius-md)" }}>
            <AlertCircle size={16} />
            <span>{restoreError}</span>
          </div>
        )}

        {restoreResult && (
          <div
            className="badge-success flex flex-col gap-1"
            style={{ padding: "14px 16px", marginTop: "14px", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.1)" }}
          >
            <div className="flex items-center gap-2 font-semibold">
              <Check size={16} />
              <span>Database Restored Successfully!</span>
            </div>
            <div style={{ fontSize: "12px" }}>
              Restored: <strong>{restoreResult.restored_transactions}</strong> transactions, <strong>{restoreResult.restored_budgets}</strong> budgets, <strong>{restoreResult.restored_debts}</strong> debts, <strong>{restoreResult.restored_savings_goals}</strong> goals.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
