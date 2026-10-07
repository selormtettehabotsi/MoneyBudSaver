import { apiClient } from "./client";

export interface SuggestionItem {
  category: "overspending" | "savings_opportunity" | "debt_alert" | "general";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  actionable_step: string;
}

export interface PillarScore {
  score: number;
  max: number;
  value_pct?: number | null;
  runway_months?: number | null;
  display?: string | null;
  has_sufficient_data?: boolean;
  dti_pct?: number | null;
  exceeded?: number;
  total?: number;
}

export interface MetricsSummary {
  monthly_income: number;
  monthly_expenses: number;
  net_cashflow: number;
  liquid_savings: number;
  dti_ratio: number;
  runway_months?: number | null;
  runway_display?: string;
  has_sufficient_data?: boolean;
  data_notice?: string | null;
  health_score: number;
  pillars: {
    savings_rate: PillarScore;
    runway: PillarScore;
    debt_burden: PillarScore;
    budget_adherence: PillarScore;
  };
  budgets_tracked: number;
  budgets_exceeded: number;
  active_debts: number;
  active_goals: number;
}

export interface WeeklyReviewResult {
  week_start_date: string;
  generated_at: string;
  health_score: number;
  suggestions: SuggestionItem[];
  metrics_summary: MetricsSummary;
}

export interface SuggestionLogOut {
  id: string;
  user_id: string;
  week_start_date: string;
  findings: {
    health_score: number;
    suggestions: SuggestionItem[];
    metrics_summary: MetricsSummary;
    generated_at: string;
  };
  created_at: string;
}

export const suggestionsApi = {
  getWeeklyReview: () => apiClient<WeeklyReviewResult>("/api/v1/suggestions/weekly"),
  generateWeeklyReview: () =>
    apiClient<WeeklyReviewResult>("/api/v1/suggestions/generate", {
      method: "POST",
    }),
  getHistory: () => apiClient<SuggestionLogOut[]>("/api/v1/suggestions/history"),
};
