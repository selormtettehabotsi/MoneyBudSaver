import { apiClient } from "./client";
import { CouncilDecision, ProviderStatusItem } from "../types/council";

export const councilApi = {
  getProviders: () => apiClient<ProviderStatusItem[]>("/api/v1/council/providers"),

  ask: (data: {
    question: string;
    decision_type?: string;
    candidate_amount?: string | null;
    enable_debate?: boolean;
    local_only_mode?: boolean;
  }) =>
    apiClient<CouncilDecision>("/api/v1/council/ask", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  preview: (data: {
    question: string;
    decision_type?: string;
    candidate_amount?: string | null;
  }) =>
    apiClient<{
      sanitized_question: string;
      anonymized_prompt: string;
      financial_snapshot: Record<string, any>;
    }>("/api/v1/council/preview", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getHistory: (limit: number = 20, offset: number = 0) =>
    apiClient<CouncilDecision[]>(`/api/v1/council/history?limit=${limit}&offset=${offset}`),

  getDecision: (id: string) => apiClient<CouncilDecision>(`/api/v1/council/decision/${id}`),

  recordDecision: (id: string, user_verdict: "accepted" | "rejected" | "modified", user_modifications?: string) =>
    apiClient<CouncilDecision>(`/api/v1/council/decide/${id}`, {
      method: "POST",
      body: JSON.stringify({ user_verdict, user_modifications }),
    }),
};
