import { apiClient } from "./client";
import { Debt } from "../types/finance";

export const debtsApi = {
  list: () => apiClient<Debt[]>("/api/v1/debts"),

  create: (data: {
    name: string;
    total_principal: string;
    remaining_balance: string;
    interest_rate: string;
    minimum_payment: string;
    due_day_of_month: number;
    start_date: string;
    notes?: string | null;
  }) =>
    apiClient<Debt>("/api/v1/debts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Debt>) =>
    apiClient<Debt>(`/api/v1/debts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  recordPayment: (id: string, payment_amount: string, payment_date?: string, notes?: string) =>
    apiClient<Debt>(`/api/v1/debts/${id}/payment`, {
      method: "POST",
      body: JSON.stringify({ payment_amount, payment_date, notes }),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/v1/debts/${id}`, {
      method: "DELETE",
    }),
};
