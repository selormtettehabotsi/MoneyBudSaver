import { apiClient } from "./client";
import { SavingsGoal } from "../types/finance";

export const goalsApi = {
  list: () => apiClient<SavingsGoal[]>("/api/v1/savings-goals"),

  create: (data: { title: string; target_amount: string; current_amount?: string; target_date?: string | null; notes?: string | null }) =>
    apiClient<SavingsGoal>("/api/v1/savings-goals", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<SavingsGoal>) =>
    apiClient<SavingsGoal>(`/api/v1/savings-goals/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  adjust: (id: string, amount: string, notes?: string) =>
    apiClient<SavingsGoal>(`/api/v1/savings-goals/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ amount, notes }),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/v1/savings-goals/${id}`, {
      method: "DELETE",
    }),
};
