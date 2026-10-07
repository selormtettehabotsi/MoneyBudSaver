/**
 * Safe Mathematical and Financial Formatting Utilities.
 * Guarantees null/undefined resilience, preventing .toFixed crashes on missing data.
 */

export interface RunwayBadge {
  label: string;
  badgeClass: string;
  status: "success" | "warning" | "danger" | "neutral";
}

export interface DTIBadge {
  label: string;
  badgeClass: string;
  status: "success" | "warning" | "danger";
}

/**
 * Formats runway in months or shows fallback string when insufficient data.
 */
export function formatRunway(
  months: number | null | undefined,
  display?: string | null,
  hasSufficientData?: boolean
): string {
  if (hasSufficientData === false) {
    return display || "Not enough data";
  }
  if (months === null || months === undefined || typeof months !== "number" || isNaN(months)) {
    return display || "Not enough data";
  }
  if (months >= 990) {
    return "99+ mo";
  }
  return `${months.toFixed(1)} mo`;
}

/**
 * Determines runway badge status and label safely.
 */
export function getRunwayStatus(
  months: number | null | undefined,
  hasSufficientData?: boolean
): RunwayBadge {
  if (hasSufficientData === false || months === null || months === undefined || typeof months !== "number" || isNaN(months)) {
    return {
      label: "Pending",
      badgeClass: "badge-secondary",
      status: "neutral",
    };
  }
  if (months < 3) {
    return {
      label: "Low",
      badgeClass: "badge-danger",
      status: "danger",
    };
  }
  if (months < 6) {
    return {
      label: "Moderate",
      badgeClass: "badge-warning",
      status: "warning",
    };
  }
  return {
    label: "Healthy",
    badgeClass: "badge-success",
    status: "success",
  };
}

/**
 * Returns helper notice string when account has insufficient transaction history.
 */
export function getRunwayNotice(
  hasSufficientData?: boolean,
  customNotice?: string | null
): string | null {
  if (hasSufficientData === false) {
    return customNotice || "Add at least 2 weeks of spending for reliable advice.";
  }
  return null;
}

/**
 * Formats Debt-to-Income (DTI) ratio percentage safely.
 */
export function formatDTI(dti: number | null | undefined, decimals = 1): string {
  if (dti === null || dti === undefined || typeof dti !== "number" || isNaN(dti)) {
    return "0.0%";
  }
  return `${dti.toFixed(decimals)}%`;
}

/**
 * Determines DTI safety badge.
 */
export function getDTIStatus(dti: number | null | undefined): DTIBadge {
  if (dti === null || dti === undefined || typeof dti !== "number" || isNaN(dti)) {
    return {
      label: "Safe",
      badgeClass: "badge-success",
      status: "success",
    };
  }
  if (dti > 40) {
    return {
      label: "Critical",
      badgeClass: "badge-danger",
      status: "danger",
    };
  }
  if (dti > 25) {
    return {
      label: "Caution",
      badgeClass: "badge-warning",
      status: "warning",
    };
  }
  return {
    label: "Safe",
    badgeClass: "badge-success",
    status: "success",
  };
}

/**
 * Formats savings rate percentage safely.
 */
export function formatSavingsRate(rate: number | null | undefined, decimals = 1): string {
  if (rate === null || rate === undefined || typeof rate !== "number" || isNaN(rate)) {
    return "0.0%";
  }
  return `${rate.toFixed(decimals)}%`;
}

/**
 * Formats generic percentage safely.
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals = 0,
  fallback = "0%"
): string {
  if (value === null || value === undefined || typeof value !== "number" || isNaN(value)) {
    return fallback;
  }
  return `${value.toFixed(decimals)}%`;
}

/**
 * Safely parses any number or string to a finite float.
 */
export function safeNumber(value: any, fallback = 0): number {
  if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
  }
  return fallback;
}
