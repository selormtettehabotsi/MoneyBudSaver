"""
AI Council Deliberation Orchestrator Engine.
Runs deterministic pre-computations, anonymization, parallel multi-model Round 1 & Round 2 debate,
confidence-weighted tallying, dissent synthesis, and quota management.
"""
import asyncio
import hashlib
import json
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.constants import VOTE_SCORES, TALLY_APPROVE_THRESHOLD, TALLY_REJECT_THRESHOLD
from app.models.council import CouncilDecision, ProviderQuota, CouncilCache
from app.models.user import User
from app.schemas.council import (
    AskCouncilRequest,
    IndividualVote,
    CouncilTally,
    CouncilDecisionOut,
)
from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import scrub_pii_from_text, build_anonymized_council_context
from app.services.council.adapters_factory import get_configured_providers
from app.services.council.base_adapter import BaseProviderAdapter


SYSTEM_INSTRUCTION_ROUND1 = """
You are a senior member of an ensemble AI Financial Advisory Council.
Analyze the user's financial decision objectively based strictly on the provided financial facts and ratios.

CRITICAL INSTRUCTIONS:
1. All arithmetic, affordability ratios, DTI, runway, and cash flow are already pre-computed deterministically as ground-truth facts. Do NOT recalculate arithmetic; reason deeply about the implications.
2. Evaluate potential risks, cash flow sustainability, and long-term financial health.
3. Be candid and balanced. If conditions or caveats are necessary, list them clearly.
4. You MUST respond with a single valid JSON object matching the requested schema.
"""


SYSTEM_INSTRUCTION_ROUND2 = """
You are in Round 2 of the AI Financial Advisory Council debate.
You are now reviewing the anonymized positions and reasoning of your peer council members from Round 1.

CRITICAL INSTRUCTIONS:
1. Re-evaluate your position in light of your peers' arguments and identified risks.
2. You may either maintain your original vote or change it if a peer raised a compelling counterpoint.
3. Explain your decision clearly in your reasoning.
4. You MUST respond with a single valid JSON object matching the requested schema.
"""


def _compute_query_hash(user_id: str, question: str, amount: Optional[Decimal], debate: bool, local_only: bool) -> str:
    """Generates a SHA256 query hash for caching identical council inquiries."""
    key = f"{user_id}:{question.strip().lower()}:{str(amount)}:{debate}:{local_only}:{date.today().isoformat()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _calculate_tally(votes: List[IndividualVote]) -> CouncilTally:
    """
    Computes the confidence-weighted tally and synthesizes consensus & dissent.
    Scoring: approve=+1.0, approve_with_conditions=+0.5, reject=-1.0.
    """
    successful_votes = [v for v in votes if v.status == "success" and v.verdict is not None]
    skipped_votes = len(votes) - len(successful_votes)

    if not successful_votes:
        return CouncilTally(
            weighted_score=0.0,
            final_verdict="split_decision",
            consensus_summary="All AI Council members were unavailable or rate-limited. Please retry shortly.",
            key_agreements=[],
            key_disagreements=[],
            is_tie=True,
            total_votes_counted=0,
            total_votes_skipped=skipped_votes,
        )

    total_weight = 0.0
    total_confidence = 0.0

    agreements: List[str] = []
    disagreements: List[str] = []

    approve_reasons: List[str] = []
    reject_reasons: List[str] = []
    all_risks: List[str] = []
    all_conditions: List[str] = []

    for v in successful_votes:
        conf = float(v.confidence if v.confidence is not None else 50)
        score = VOTE_SCORES.get(v.verdict or "reject", -1.0)
        total_weight += score * conf
        total_confidence += conf

        all_risks.extend(v.risks)
        all_conditions.extend(v.conditions)

        if v.verdict in ("approve", "approve_with_conditions") and v.reasoning:
            approve_reasons.append(f"{v.provider_name}: {v.reasoning}")
        elif v.verdict == "reject" and v.reasoning:
            reject_reasons.append(f"{v.provider_name}: {v.reasoning}")

    weighted_score = round(total_weight / total_confidence, 3) if total_confidence > 0 else 0.0

    # Determine final verdict
    if weighted_score >= TALLY_APPROVE_THRESHOLD:
        has_conditions = any(v.verdict == "approve_with_conditions" for v in successful_votes)
        final_verdict = "approve_with_conditions" if (has_conditions or weighted_score < 0.65) else "approve"
        is_tie = False
    elif weighted_score <= TALLY_REJECT_THRESHOLD:
        final_verdict = "reject"
        is_tie = False
    else:
        final_verdict = "split_decision"
        is_tie = True

    # Synthesize key agreements and disagreements
    if approve_reasons and not reject_reasons:
        agreements.append("Council unanimously approved proceeding with this financial decision.")
    elif reject_reasons and not approve_reasons:
        agreements.append("Council unanimously recommended against proceeding with this decision.")
    else:
        if approve_reasons:
            agreements.append(f"Proponents highlighted: {approve_reasons[0]}")
        if reject_reasons:
            disagreements.append(f"Dissenting view: {reject_reasons[0]}")

    if all_risks:
        agreements.append(f"Primary identified risks: {', '.join(list(dict.fromkeys(all_risks))[:3])}")

    if all_conditions:
        agreements.append(f"Required conditions: {', '.join(list(dict.fromkeys(all_conditions))[:3])}")

    # Build plain-language consensus summary
    if final_verdict == "approve":
        summary = f"The Council approves this decision with a strong weighted score of +{weighted_score:.2f} across {len(successful_votes)} models."
    elif final_verdict == "approve_with_conditions":
        summary = f"The Council leans in favor (+{weighted_score:.2f}) but advises proceeding ONLY under strict conditions."
    elif final_verdict == "reject":
        summary = f"The Council strongly advises against this decision (Score: {weighted_score:.2f}) due to identified risks to cash flow or runway."
    else:
        summary = f"The Council is split (Score: {weighted_score:.2f}). Significant divergence exists among members; exercise caution."

    return CouncilTally(
        weighted_score=weighted_score,
        final_verdict=final_verdict,
        consensus_summary=summary,
        key_agreements=agreements,
        key_disagreements=disagreements,
        is_tie=is_tie,
        total_votes_counted=len(successful_votes),
        total_votes_skipped=skipped_votes,
    )


async def execute_council_deliberation(
    db: Session,
    user: User,
    request: AskCouncilRequest,
) -> CouncilDecisionOut:
    """
    Orchestrates the entire multi-AI deliberation pipeline.
    """
    user_settings = user.settings or {}
    max_dti = float(user_settings.get("max_dti_ratio", settings.DEFAULT_MAX_DTI_RATIO))
    min_runway = float(user_settings.get("min_runway_months", settings.DEFAULT_MIN_RUNWAY_MONTHS))

    # 1. Deterministic Financial Snapshot
    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=user.id,
        candidate_amount=request.candidate_amount,
        decision_type=request.decision_type,
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    # 2. Anonymize context
    sanitized_question = scrub_pii_from_text(request.question)
    anonymized_context = build_anonymized_council_context(snapshot, user.currency)

    round1_prompt = (
        f"{anonymized_context}\n\n"
        f"USER DECISION / INQUIRY:\n\"{sanitized_question}\"\n"
        f"DECISION TYPE: {request.decision_type.upper()}\n"
        f"PROPOSED AMOUNT: {user.currency} {float(request.candidate_amount):,.2f}\n\n" if request.candidate_amount else ""
        f"Please independently evaluate this decision and return your strict JSON vote."
    )

    # 3. Get Configured Provider Adapters
    providers = get_configured_providers(
        user_settings=user_settings,
        local_only_mode=request.local_only_mode,
    )

    if not providers:
        # Return fallback if no providers configured
        dummy_vote = IndividualVote(
            provider_name="System",
            model_id="none",
            model_family="System",
            status="skipped",
            round_number=1,
            error_message="No AI provider API keys configured in environment or settings.",
        )
        tally = _calculate_tally([dummy_vote])
        decision = CouncilDecision(
            user_id=user.id,
            question=sanitized_question,
            decision_type=request.decision_type,
            candidate_amount=request.candidate_amount,
            enable_debate=request.enable_debate,
            local_only_mode=request.local_only_mode,
            financial_snapshot=snapshot,
            round1_votes={"system": dummy_vote.model_dump()},
            round2_votes=None,
            final_tally=tally.model_dump(),
            guardrail_breach=snapshot if snapshot.get("guardrail_breached") else None,
        )
        db.add(decision)
        db.commit()
        db.refresh(decision)
        return CouncilDecisionOut.model_validate(decision)

    # 4. Round 1: Concurrent Parallel Queries
    timeout = settings.AI_PROVIDER_TIMEOUT_SECONDS
    round1_tasks = [
        p.query(
            prompt=round1_prompt,
            system_instruction=SYSTEM_INSTRUCTION_ROUND1,
            timeout_seconds=timeout,
            round_number=1,
        )
        for p in providers
    ]
    round1_results: List[IndividualVote] = await asyncio.gather(*round1_tasks)
    round1_votes_map = {v.provider_name: v.model_dump() for v in round1_results}

    # 5. Round 2: Council Debate & Consensus (if requested and >=2 valid votes)
    successful_r1 = [v for v in round1_results if v.status == "success" and v.verdict]
    round2_votes_map = None
    effective_votes = round1_results

    if request.enable_debate and len(successful_r1) >= 2:
        # Build peer summary
        peer_lines = ["PEER COUNCIL MEMBER ROUND 1 POSITIONS:"]
        for v in successful_r1:
            peer_lines.append(
                f"- {v.provider_name} ({v.model_family}): Voted {v.verdict.upper()} (Confidence: {v.confidence}%) | "
                f"Reasoning: {v.reasoning} | Identified Risks: {', '.join(v.risks)}"
            )
        peer_summary = "\n".join(peer_lines)

        round2_prompt = (
            f"{round1_prompt}\n\n"
            f"{peer_summary}\n\n"
            f"Review your peers' perspectives above. Provide your final Round 2 vote in strict JSON format."
        )

        round2_tasks = [
            p.query(
                prompt=round2_prompt,
                system_instruction=SYSTEM_INSTRUCTION_ROUND2,
                timeout_seconds=timeout,
                round_number=2,
            )
            for p in providers
        ]
        round2_results: List[IndividualVote] = await asyncio.gather(*round2_tasks)
        round2_votes_map = {v.provider_name: v.model_dump() for v in round2_results}
        effective_votes = round2_results

    # 6. Final Tally Calculation
    final_tally = _calculate_tally(effective_votes)

    # 7. Persist Council Decision
    decision = CouncilDecision(
        user_id=user.id,
        question=sanitized_question,
        decision_type=request.decision_type,
        candidate_amount=request.candidate_amount,
        enable_debate=request.enable_debate,
        local_only_mode=request.local_only_mode,
        financial_snapshot=snapshot,
        round1_votes=round1_votes_map,
        round2_votes=round2_votes_map,
        final_tally=final_tally.model_dump(),
        guardrail_breach=snapshot if snapshot.get("guardrail_breached") else None,
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)

    return CouncilDecisionOut.model_validate(decision)
