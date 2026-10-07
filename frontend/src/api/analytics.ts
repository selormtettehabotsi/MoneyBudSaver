import { apiClient } from "./client";
import { DashboardData, RunwayData, CashflowData } from "../types/finance";

export const analyticsApi = {
  getDashboard: () => apiClient<DashboardData>("/api/v1/analytics/dashboard"),
  getRunway: () => apiClient<RunwayData>("/api/v1/analytics/runway"),
  getCashflow: () => apiClient<CashflowData>("/api/v1/analytics/cashflow"),
};
