import { apiClient } from "./client";
import { CouncilDecision, CouncilJobStatus, ProviderStatusItem, TestConnectionResponse } from "../types/council";

export const councilApi = {
  getProviders: () => apiClient<ProviderStatusItem[]>("/api/v1/council/providers"),

  testConnection: (provider_name: string, model_id?: string) =>
    apiClient<TestConnectionResponse>("/api/v1/council/test-connection", {
      method: "POST",
      body: JSON.stringify({ provider_name, model_id }),
    }),

  ask: (data: {
    question: string;
    decision_type?: string;
    candidate_amount?: string | null;
    enable_debate?: boolean;
    local_only_mode?: boolean;
  }) =>
    apiClient<CouncilJobStatus>("/api/v1/council/ask", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getJobStatus: (job_id: string) =>
    apiClient<CouncilJobStatus>(`/api/v1/council/jobs/${job_id}`),

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

  retryFailed: (id: string) =>
    apiClient<CouncilJobStatus>(`/api/v1/council/decision/${id}/retry-failed`, {
      method: "POST",
    }),

  cancelJob: (job_id: string) =>
    apiClient<CouncilJobStatus>(`/api/v1/council/jobs/${job_id}/cancel`, {
      method: "POST",
    }),

  resetCircuitBreaker: (provider_name: string) =>
    apiClient<{ status: string; provider_name: string; message: string }>(
      `/api/v1/council/providers/${provider_name}/reset-circuit-breaker`,
      {
        method: "POST",
      }
    ),

  updateModel: (provider_name: string, payload: any) =>
    apiClient<any>(`/api/v1/council/providers/${provider_name}/model`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  revertModel: (provider_name: string, model_id: string) =>
    apiClient<any>(`/api/v1/council/providers/${provider_name}/revert`, {
      method: "POST",
      body: JSON.stringify({ model_id }),
    }),

  getRecommended: () =>
    apiClient<Record<string, any[]>>("/api/v1/council/recommended"),

  updateRecommended: (provider_name: string, models: string[]) =>
    apiClient<{ status: string }>(`/api/v1/council/providers/${provider_name}/recommended`, {
      method: "PUT",
      body: JSON.stringify({ models }),
    }),

  useRecommended: (provider_name: string) =>
    apiClient<any>(`/api/v1/council/providers/${provider_name}/use-recommended`, {
      method: "POST",
    }),

  findWorking: (provider_name: string) =>
    apiClient<any>(`/api/v1/council/providers/${provider_name}/find-working`, {
      method: "POST",
    }),

  fixAll: () =>
    apiClient<any>("/api/v1/council/providers/fix-all", {
      method: "POST",
    }),

  getAutoSwitch: () =>
    apiClient<any>("/api/v1/council/settings/auto-switch"),

  updateAutoSwitch: (enabled: boolean) =>
    apiClient<any>("/api/v1/council/settings/auto-switch", {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),

  getSwitchLogs: (limit: number = 50) =>
    apiClient<any[]>(`/api/v1/council/switch-logs?limit=${limit}`),

  revertSwitchLog: (log_id: string) =>
    apiClient<{ status: string }>(`/api/v1/council/switch-logs/${log_id}/revert`, {
      method: "POST",
    }),
};

