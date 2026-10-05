export function getCsrfToken(): string | null {
  const match = document.cookie.match(new RegExp("(^| )mc_csrf=([^;]+)"));
  return match ? match[2] : null;
}

export function downloadTransactionsCsv(): void {
  window.open("/api/v1/data/export/csv/transactions", "_blank");
}

export function downloadBudgetsCsv(): void {
  window.open("/api/v1/data/export/csv/budgets", "_blank");
}

export function downloadDebtsCsv(): void {
  window.open("/api/v1/data/export/csv/debts", "_blank");
}

export function downloadFullBackupJson(): void {
  window.open("/api/v1/data/backup/json", "_blank");
}

export interface ImportCsvResponse {
  success: boolean;
  imported_count: number;
  skipped_duplicates: number;
  created_categories: number;
  errors: string[];
}

export async function importTransactionsCsv(file: File, createCategories: boolean = true): Promise<ImportCsvResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("create_categories", String(createCategories));

  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch("/api/v1/data/import/csv/transactions", {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "CSV Import failed." }));
    throw new Error(errorData.detail || "CSV Import failed.");
  }

  return response.json();
}

export interface RestoreBackupResponse {
  success: boolean;
  restored_categories: number;
  restored_transactions: number;
  restored_budgets: number;
  restored_savings_goals: number;
  restored_debts: number;
  restored_council_decisions: number;
}

export async function restoreFullBackupJson(file: File, overwrite: boolean = false): Promise<RestoreBackupResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("overwrite", String(overwrite));

  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {};
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  const response = await fetch("/api/v1/data/restore/json", {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: "Database restore failed." }));
    throw new Error(errorData.detail || "Database restore failed.");
  }

  return response.json();
}
