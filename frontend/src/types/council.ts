export type CouncilVerdict = "approve" | "reject" | "approve_with_conditions" | "split_decision";

export interface IndividualVote {
  provider_name: string;
  model_id: string;
  model_family: string;
  status: "success" | "failed" | "timeout" | "rate_limited" | "skipped" | "unavailable" | "missing_key" | "not_configured";
  verdict: "approve" | "reject" | "approve_with_conditions" | null;
  confidence: number | null;
  reasoning: string | null;
  risks: string[];
  conditions: string[];
  suggested_amount: string | null;
  round_number: number;
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
}

export interface CouncilDecision {
  id: string;
  user_id: string;
  question: string;
  decision_type: string;
  candidate_amount: string | null;
  enable_debate: boolean;
  local_only_mode: boolean;
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

export interface ProviderStatusItem {
  name: string;
  display_name: string;
  model_family: string;
  model_id: string;
  is_configured: boolean;
  is_local: boolean;
  daily_request_count: number;
  status: "ready" | "missing_key" | "disabled_in_hosted" | "rate_limited";
}
