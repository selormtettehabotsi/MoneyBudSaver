export interface UserSettings {
  max_dti_ratio?: number;
  min_runway_months?: number;
  providers_enabled?: Record<string, boolean>;
  custom_model_ids?: Record<string, string>;
}

export interface User {
  id: string;
  email: string;
  currency: string;
  is_active: boolean;
  created_at: string;
  settings: UserSettings;
  is_hosted: boolean;
}

export interface AuthResponse {
  user: User;
  csrf_token?: string;
}
