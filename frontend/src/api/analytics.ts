import { apiClient } from "./client";
import { DashboardData } from "../types/finance";

export const analyticsApi = {
  getDashboard: () => apiClient<DashboardData>("/api/v1/analytics/dashboard"),
};
