import { BadgeVariant } from "../components/common/Badge";

export interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  badgeClass: string;
}

/**
 * Maps all ProviderStatusItem.status values correctly per Bug #2 specifications:
 * ready, missing_key, missing_model_id, disabled_in_hosted, rate_limited,
 * circuit_breaker_tripped, working, failed, untested, slow, skipped.
 */
export function getProviderStatusMeta(status: string, circuitBreakerTripped = false, isNearLimit = false): StatusMeta {
  if (circuitBreakerTripped || status === "circuit_breaker_tripped") {
    return {
      label: "Skipped (Cooldown)",
      variant: "warning",
      badgeClass: "badge-warning",
    };
  }

  switch (status) {
    case "ready":
      return {
        label: "Ready",
        variant: isNearLimit ? "warning" : "success",
        badgeClass: isNearLimit ? "badge-warning" : "badge-success",
      };
    case "working":
      return {
        label: "Working",
        variant: isNearLimit ? "warning" : "success",
        badgeClass: isNearLimit ? "badge-warning" : "badge-success",
      };
    case "untested":
      return {
        label: "Untested",
        variant: "neutral",
        badgeClass: "badge-secondary",
      };
    case "slow":
      return {
        label: "Slow (>30s)",
        variant: "warning",
        badgeClass: "badge-warning",
      };
    case "rate_limited":
      return {
        label: "Rate Limited",
        variant: "warning",
        badgeClass: "badge-warning",
      };
    case "skipped":
      return {
        label: "Skipped",
        variant: "warning",
        badgeClass: "badge-warning",
      };
    case "missing_key":
      return {
        label: "API Key Missing",
        variant: "danger",
        badgeClass: "badge-danger",
      };
    case "missing_model_id":
      return {
        label: "Set Model ID",
        variant: "danger",
        badgeClass: "badge-danger",
      };
    case "disabled_in_hosted":
      return {
        label: "Local Only",
        variant: "neutral",
        badgeClass: "badge-secondary",
      };
    case "failed":
      return {
        label: "Test Failed",
        variant: "danger",
        badgeClass: "badge-danger",
      };
    default:
      return {
        label: "Not Configured",
        variant: "neutral",
        badgeClass: "badge-secondary",
      };
  }
}
