import { apiClient } from "./client";
import { BudgetProgress } from "../types/finance";

export const budgetsApi = {
  list: (month?: number, year?: number) => {
    const query = new URLSearchParams();
    if (month) query.append("month", month.toString());
    if (year) query.append("year", year.toString());
    return apiClient<BudgetProgress[]>(`/api/v1/budgets?${query.toString()}`);
  },

  setLimit: (data: { category_id: string; month: number; year: number; amount_limit: string }) =>
    apiClient<any>("/api/v1/budgets", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateLimit: (id: string, amount_limit: string) =>
    apiClient<any>(`/api/v1/budgets/${id}`, {
      method: "PUT",
      body: JSON.stringify({ amount_limit }),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/v1/budgets/${id}`, {
      method: "DELETE",
    }),
};
