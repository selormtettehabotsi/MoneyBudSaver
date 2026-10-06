import { apiClient } from "./client";
import { User, UserSettings } from "../types/auth";

export const authApi = {
  login: (email: string, password: string) =>
    apiClient<User>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, invite_code?: string, currency?: string) =>
    apiClient<User>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, invite_code: invite_code || undefined, currency }),
    }),

  logout: () =>
    apiClient<{ message: string }>("/api/v1/auth/logout", {
      method: "POST",
    }),

  getProfile: () => apiClient<User>("/api/v1/auth/me"),

  updateSettings: (currency?: string, settings?: UserSettings) =>
    apiClient<User>("/api/v1/auth/settings", {
      method: "PUT",
      body: JSON.stringify({ currency, settings }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    apiClient<{ message: string }>("/api/v1/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
};
