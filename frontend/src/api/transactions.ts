import { apiClient } from "./client";
import { Transaction, TransactionListResponse, TransactionType } from "../types/finance";

export interface TransactionFilterParams {
  category_id?: string;
  type?: TransactionType;
  start_date?: string;
  end_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const transactionsApi = {
  list: (params: TransactionFilterParams = {}) => {
    const query = new URLSearchParams();
    if (params.category_id) query.append("category_id", params.category_id);
    if (params.type) query.append("type", params.type);
    if (params.start_date) query.append("start_date", params.start_date);
    if (params.end_date) query.append("end_date", params.end_date);
    if (params.search) query.append("search", params.search);
    if (params.limit) query.append("limit", params.limit.toString());
    if (params.offset !== undefined) query.append("offset", params.offset.toString());

    return apiClient<TransactionListResponse>(`/api/v1/transactions?${query.toString()}`);
  },

  create: (data: {
    amount: string;
    type: TransactionType;
    date: string;
    description: string;
    category_id?: string | null;
    is_recurring?: boolean;
    tags?: string[];
  }) =>
    apiClient<Transaction>("/api/v1/transactions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      amount?: string;
      type?: TransactionType;
      date?: string;
      description?: string;
      category_id?: string | null;
      is_recurring?: boolean;
      tags?: string[];
    }
  ) =>
    apiClient<Transaction>(`/api/v1/transactions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiClient<void>(`/api/v1/transactions/${id}`, {
      method: "DELETE",
    }),
};
