import React, { useState } from "react";
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
import { useToast } from "../context/ToastContext";
import { useConfirm } from "../context/ConfirmDialogContext";
import {
  Database,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  ArrowDownToLine,
  Smartphone,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { FileDropzone } from "../components/common/FileDropzone";
import { LoadingProgress } from "../components/common/LoadingProgress";

export const DataPage: React.FC = () => {
  const { isOnline } = useSync();
  const toast = useToast();
  const { confirm } = useConfirm();

  // CSV Import State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [createMissingCats, setCreateMissingCats] = useState(true);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<ImportCsvResponse | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  // JSON Restore State
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [overwriteRestore, setOverwriteRestore] = useState(false);
  const [jsonRestoring, setJsonRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreBackupResponse | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvImporting(true);
    setCsvError(null);
    setCsvResult(null);

    try {
      const res = await importTransactionsCsv(csvFile, createMissingCats);
      setCsvResult(res);
      setCsvFile(null);
      toast.success(`Imported ${res.imported_count} transactions successfully!`);
    } catch (err: any) {
      const msg = err.message || "Failed to import CSV statement.";
      setCsvError(msg);
      toast.error(msg);
    } finally {
      setCsvImporting(false);
    }
  };

  const handleJsonRestore = async () => {
    if (!jsonFile) return;
    if (overwriteRestore) {
      const proceed = await confirm({
        title: "Overwrite Existing Data?",
        message:
          "WARNING: You have selected 'Overwrite Existing Data'. This will completely replace your current transactions, budgets, debts, goals, and council records with the backup file. This cannot be undone.",
        confirmText: "Overwrite All Data",
        cancelText: "Cancel",
        isDanger: true,
      });
      if (!proceed) return;
    }

    setJsonRestoring(true);
    setRestoreError(null);
    setRestoreResult(null);

    try {
      const res = await restoreFullBackupJson(jsonFile, overwriteRestore);
      setRestoreResult(res);
      setJsonFile(null);
      toast.success("Database restored successfully from backup!");
    } catch (err: any) {
      const msg = err.message || "Failed to restore database from backup.";
      setRestoreError(msg);
      toast.error(msg);
    } finally {
      setJsonRestoring(false);
    }
  };

  return (
    <div className="flex flex-col gap-6" style={{ width: "100%", maxWidth: "100%" }}>
      {/* Header */}
      <PageHeader
        title="Data & Backups"
        subtitle="Export clean spreadsheets, import mobile money/bank statements, and manage full portable JSON snapshots."
      />

      {/* Offline Alert */}
      {!isOnline && (
        <div
          className="badge-warning flex items-center gap-2"
          style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", fontSize: "13px" }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>
            Cloud export and restore require an active network connection. Your local offline transactions and budgets remain safely stored in this browser.
          </span>
        </div>
      )}

      {/* 1. CSV Statement Import */}
      <Card
        title="Import Statement (CSV)"
        subtitle="Fuzzy auto-matching for dates, amounts, descriptions, and reference IDs with automatic duplicate skipping."
        headerAction={
          <div className="flex items-center gap-2">
            <Badge variant="info">
              <Smartphone size={12} style={{ marginRight: "4px" }} /> MoMo & Banks
            </Badge>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Supported Format Chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
              padding: "10px 14px",
              background: "var(--bg-surface-solid)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Supported Formats:</span>
            <span className="badge badge-neutral">MTN MoMo</span>
            <span className="badge badge-neutral">Telecel Cash</span>
            <span className="badge badge-neutral">M-Pesa</span>
            <span className="badge badge-neutral">Ecobank</span>
            <span className="badge badge-neutral">Standard Chartered</span>
            <span className="badge badge-neutral">Stanbic</span>
            <span className="badge badge-neutral">Zenith Bank</span>
            <span className="badge badge-neutral">Generic CSV</span>
          </div>

          {/* File Dropzone */}
          <FileDropzone
            accept=".csv,text/csv"
            onFileSelect={(file) => {
              setCsvFile(file);
              setCsvResult(null);
              setCsvError(null);
            }}
            selectedFile={csvFile}
            label="Drop your statement CSV here, or click to browse"
            hint="Supports CSV exports up to 10 MB"
            disabled={!isOnline || csvImporting}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ marginTop: "4px" }}>
            <label className="flex items-center gap-2" style={{ fontSize: "13px", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                disabled={!isOnline || csvImporting}
                checked={createMissingCats}
                onChange={(e) => setCreateMissingCats(e.target.checked)}
                style={{ width: "16px", height: "16px", accentColor: "var(--accent-primary)" }}
              />
              <span>Automatically create new categories discovered in statement</span>
            </label>

            <Button
              type="button"
              variant="primary"
              disabled={!isOnline || !csvFile || csvImporting}
              onClick={handleCsvImport}
              isLoading={csvImporting}
              icon={Upload}
            >
              Upload & Parse Statement
            </Button>
          </div>

          {/* Import Progress Bar */}
          {csvImporting && (
            <div
              style={{
                padding: "16px 20px",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-surface-solid)",
                border: "1px solid var(--border-color)",
                marginTop: "4px",
              }}
            >
              <LoadingProgress
                compact
                message="Parsing statement columns and deduplicating..."
                submessage="Matching dates, amounts, categories, and references"
              />
            </div>
          )}

          {/* Import Error */}
          {csvError && (
            <div
              className="badge-danger flex items-center gap-2"
              style={{ padding: "12px 16px", borderRadius: "var(--radius-md)", fontSize: "13px" }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{csvError}</span>
            </div>
          )}

          {/* Import Success Result */}
          {csvResult && (
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--success-bg)",
                border: "1px solid var(--success-border)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div className="flex items-center gap-2" style={{ color: "var(--success)", fontWeight: 700, fontSize: "15px" }}>
                <CheckCircle2 size={18} />
                <span>Import Finished Successfully!</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "12px",
                  marginTop: "4px",
                }}
              >
                <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Imported</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--success)", fontFamily: "var(--font-mono)" }}>
                    {csvResult.imported_count}
                  </div>
                </div>
                <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Duplicates Skipped</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                    {csvResult.skipped_duplicates}
                  </div>
                </div>
                <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Categories Created</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-primary)", fontFamily: "var(--font-mono)" }}>
                    {csvResult.created_categories}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 2. CSV Data Exports */}
      <Card
        title="Spreadsheet Exports (CSV)"
        subtitle="Download raw financial data to inspect in Microsoft Excel, Google Sheets, or Numbers."
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <div className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                <FileSpreadsheet size={16} style={{ color: "var(--accent-primary)" }} />
                <span>Transactions</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Complete ledger of income, expense, and transfer records with categories and notes.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isOnline}
              onClick={downloadTransactionsCsv}
              icon={Download}
            >
              Export CSV
            </Button>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <div className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                <FileSpreadsheet size={16} style={{ color: "var(--accent-secondary)" }} />
                <span>Budgets</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Monthly spending targets, limits, and historical budget allocations by category.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isOnline}
              onClick={downloadBudgetsCsv}
              icon={Download}
            >
              Export CSV
            </Button>
          </div>

          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div>
              <div className="flex items-center gap-2" style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
                <FileSpreadsheet size={16} style={{ color: "var(--accent-purple)" }} />
                <span>Debts & Loans</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                Outstanding liabilities, interest rates (APR), minimum dues, and payment schedules.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!isOnline}
              onClick={downloadDebtsCsv}
              icon={Download}
            >
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* 3. Full Database Backup & Restore (JSON) */}
      <Card
        title="Full Database Snapshot & Disaster Recovery (JSON)"
        subtitle="Portable full-system backup containing all transactions, budgets, debts, goals, and AI Council consultations."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Snapshot Export */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div className="flex items-center gap-2">
              <Database size={18} style={{ color: "var(--accent-primary)" }} />
              <h4 style={{ fontSize: "15px", fontWeight: 600 }}>Export JSON Snapshot</h4>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Download a complete machine-readable snapshot file. Save this to your encrypted drive or cloud storage for safe keeping.
            </p>

            <div
              style={{
                marginTop: "auto",
                paddingTop: "14px",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              <Button
                type="button"
                variant="primary"
                disabled={!isOnline}
                onClick={downloadFullBackupJson}
                icon={ArrowDownToLine}
                style={{ width: "100%" }}
              >
                Download Snapshot (.json)
              </Button>
            </div>
          </div>

          {/* Snapshot Restore */}
          <div
            style={{
              padding: "20px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              background: "var(--bg-surface-solid)",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div className="flex items-center gap-2">
              <Layers size={18} style={{ color: "var(--accent-purple)" }} />
              <h4 style={{ fontSize: "15px", fontWeight: 600 }}>Restore from Snapshot</h4>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Restore transactions, budgets, and council deliberations from an earlier JSON backup snapshot.
            </p>

            <FileDropzone
              accept=".json,application/json"
              onFileSelect={(file) => {
                setJsonFile(file);
                setRestoreResult(null);
                setRestoreError(null);
              }}
              selectedFile={jsonFile}
              label="Drop your JSON backup file here"
              hint="Must be a valid MoneyCouncil backup file"
              disabled={!isOnline || jsonRestoring}
            />

            <div
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                background: overwriteRestore ? "var(--danger-bg)" : "var(--bg-surface)",
                border: `1px solid ${overwriteRestore ? "var(--danger-border)" : "var(--border-color)"}`,
                transition: "all 0.2s ease",
              }}
            >
              <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  disabled={!isOnline || jsonRestoring}
                  checked={overwriteRestore}
                  onChange={(e) => setOverwriteRestore(e.target.checked)}
                  style={{ accentColor: "var(--danger)" }}
                />
                <span style={{ fontWeight: overwriteRestore ? 600 : 400, color: overwriteRestore ? "var(--danger)" : "var(--text-secondary)" }}>
                  Overwrite existing records (wipe & replace current database)
                </span>
              </label>
            </div>

            <Button
              type="button"
              variant={overwriteRestore ? "danger" : "secondary"}
              disabled={!isOnline || !jsonFile || jsonRestoring}
              onClick={handleJsonRestore}
              isLoading={jsonRestoring}
              icon={RefreshCw}
              style={{ width: "100%", marginTop: "auto" }}
            >
              Restore Database
            </Button>

            {jsonRestoring && (
              <div style={{ marginTop: "12px", width: "100%" }}>
                <LoadingProgress
                  compact
                  message="Restoring snapshot to database..."
                  subMessage="Validating transactions, budgets, goals, and recalculating running balances..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Restore Error Banner */}
        {restoreError && (
          <div
            className="badge-danger flex items-center gap-2"
            style={{ padding: "12px 16px", marginTop: "16px", borderRadius: "var(--radius-md)", fontSize: "13px" }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{restoreError}</span>
          </div>
        )}

        {/* Restore Success Banner */}
        {restoreResult && (
          <div
            style={{
              padding: "16px",
              marginTop: "16px",
              borderRadius: "var(--radius-md)",
              background: "var(--success-bg)",
              border: "1px solid var(--success-border)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div className="flex items-center gap-2" style={{ color: "var(--success)", fontWeight: 700, fontSize: "15px" }}>
              <CheckCircle2 size={18} />
              <span>Snapshot Restored Successfully!</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: "10px",
                marginTop: "4px",
              }}
            >
              <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Transactions</div>
                <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {restoreResult.restored_transactions}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Budgets</div>
                <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {restoreResult.restored_budgets}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Debts</div>
                <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {restoreResult.restored_debts}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface-solid)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Savings Goals</div>
                <div style={{ fontSize: "18px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {restoreResult.restored_savings_goals}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
