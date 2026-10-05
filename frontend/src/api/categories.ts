import { apiClient } from "./client";
import { Category, TransactionType } from "../types/finance";

export const categoriesApi = {
  list: () => apiClient<Category[]>("/api/v1/categories"),

  create: (data: { name: string; type: TransactionType; icon_name?: string; color_hex?: string }) =>
    apiClient<Category>("/api/v1/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; type?: TransactionType; icon_name?: string; color_hex?: string }) =>
    apiClient<Category>(`/api/v1/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/v1/categories/${id}`, {
      method: "DELETE",
    }),
};
