export type CouncilVerdict = "approve" | "reject" | "approve_with_conditions" | "split_decision" | "no_quorum";

export interface IndividualVote {
  provider_name: string;
  display_name?: string | null;
  model_id: string;
  model_family: string;
  model_used?: string | null;
  is_fallback?: boolean;
  status: "success" | "failed" | "timeout" | "rate_limited" | "skipped" | "unavailable" | "missing_key" | "not_configured" | "invalid_key" | "model_not_found";
  verdict: "approve" | "reject" | "approve_with_conditions" | null;
  confidence: number | null;
  reasoning: string | null;
  risks: string[];
  conditions: string[];
  suggested_amount: string | null;
  round_number: number;
  latency_ms?: number | null;
  error_message?: string | null;
}

export interface CouncilTally {
  weighted_score: number;
  final_verdict: CouncilVerdict;
  consensus_summary: string;
  key_agreements: string[];
  key_disagreements: string[];
  is_tie: boolean;
  total_votes_counted: number;
  total_votes_skipped: number;
  min_quorum_required?: number;
  has_quorum?: boolean;
  diversity_warning?: string | null;
  active_families_count?: number;
  active_families?: string[];
}

export interface CouncilDecision {
  id: string;
  user_id: string;
  question: string;
  decision_type: string;
  candidate_amount: string | null;
  enable_debate: boolean;
  local_only_mode: boolean;
  status?: string;
  financial_snapshot: Record<string, any>;
  round1_votes: Record<string, IndividualVote>;
  round2_votes: Record<string, IndividualVote> | null;
  final_tally: CouncilTally;
  guardrail_breach: Record<string, any> | null;
  user_verdict: "accepted" | "rejected" | "modified" | null;
  user_modifications: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface CouncilJobStatus {
  job_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_round: number;
  total_rounds: number;
  providers_progress: Record<string, string>;
  decision?: CouncilDecision | null;
  error?: string | null;
}

export interface TestConnectionResponse {
  provider_name: string;
  model_id: string;
  http_status?: number | null;
  latency_ms: number;
  status: "success" | "invalid_key" | "model_not_found" | "rate_limited" | "timeout" | "ttft_timeout" | "bad_json" | "error" | "skipped";
  diagnosis: string;
  catalog_ok?: boolean | null;
  chat_status?: string | null;
  ttft_ms?: number | null;
  median_ttft_ms?: number | null;
  retry_after_seconds?: number | null;
  is_free?: boolean | null;
  free_models?: string[];
  available_models_label?: string | null;
  alternative_models?: string[];
  privacy_hint?: string | null;
  model_found_in_list?: boolean | null;
  available_models_count: number;
  close_matches: string[];
}

export interface ProviderStatusItem {
  name: string;
  display_name: string;
  model_family: string;
  model_id: string;
  fallback_model_id?: string | null;
  is_configured: boolean;
  is_local: boolean;
  has_key: boolean;
  daily_request_count: number;
  daily_quota_limit?: number | null;
  is_near_limit?: boolean;
  shares_key_with?: string | null;
  status: "ready" | "missing_key" | "missing_model_id" | "disabled_in_hosted" | "rate_limited" | "circuit_breaker_tripped" | "working" | "failed" | "untested" | "slow" | "skipped";
  circuit_breaker_tripped?: boolean;
  circuit_breaker_reason?: string | null;
  circuit_breaker_resets_in_seconds?: number | null;
  median_ttft_ms?: number | null;
  is_slow?: boolean;
  enabled_in_council?: boolean;
  confirmed_free?: boolean;
  history?: string[];
  base_url?: string | null;
  env_key_name?: string | null;
  exclude_slow_round2?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
}

export interface UpdateProviderModelRequest {
  model_id: string;
  fallback_model_id?: string | null;
  family_override?: string | null;
  enabled?: boolean;
  timeout?: number;
  confirmed_free?: boolean;
  display_name?: string | null;
  base_url?: string | null;
  env_key_name?: string | null;
  exclude_slow_round2?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  force_skip_test?: boolean;
}

export interface ProviderSettingOut {
  provider_key: string;
  model_id?: string | null;
  fallback_model_id?: string | null;
  family_override?: string | null;
  enabled: boolean;
  timeout: number;
  temperature: number;
  top_p: number;
  max_tokens: number;
  confirmed_free: boolean;
  history: string[];
  display_name?: string | null;
  base_url?: string | null;
  env_key_name?: string | null;
  exclude_slow_round2: boolean;
  updated_at?: string | null;
}

export interface RecommendedModelItem {
  provider_name: string;
  model_id: string;
  pattern?: string | null;
  resolved_model_id?: string | null;
  status?: string | null;
  sort_order: number;
  last_test_badge?: "passed" | "failed" | "untested";
  median_ttft_ms?: number | null;
  in_live_catalog: boolean;
  is_free: boolean;
}

export interface FindWorkingModelCandidateResult {
  model_id: string;
  provider_name: string;
  model_family: string;
  is_recommended: boolean;
  is_free: boolean;
  status: "passed" | "failed" | "timeout" | "rate_limited" | "untested";
  http_status?: number | null;
  latency_ms: number;
  ttft_ms?: number | null;
  diagnosis: string;
}

export interface FindWorkingModelsResponse {
  provider_name: string;
  tested_candidates: FindWorkingModelCandidateResult[];
  message: string;
}

export interface UseRecommendedResponse {
  provider_name: string;
  applied_model_id?: string | null;
  attempts: FindWorkingModelCandidateResult[];
  success: boolean;
  message: string;
}

export interface FixAllProviderResult {
  provider_key: string;
  action: "fixed" | "already_working" | "failed";
  model_id?: string | null;
  old_model_id?: string | null;
  new_model_id?: string | null;
  message: string;
  attempts: FindWorkingModelCandidateResult[];
}

export interface FixAllResponse {
  summary: string;
  fixed_count: number;
  working_count: number;
  failed_count: number;
  details: FixAllProviderResult[];
}

export interface ModelSwitchLogOut {
  id: string;
  provider_key: string;
  old_model_id: string;
  new_model_id: string;
  reason: string;
  reverted: boolean;
  switched_at: string;
}

export interface CouncilAppSettingOut {
  setting_key: string;
  setting_value: any;
  updated_at: string;
}


