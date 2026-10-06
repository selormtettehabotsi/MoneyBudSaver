"""
AI Council Deliberation Orchestrator Engine.
Runs deterministic pre-computations, anonymization, parallel multi-model Round 1 & Round 2 debate,
confidence-weighted tallying, quorum enforcement, dissent synthesis, and quota management.
Supports asynchronous background jobs with real-time per-provider progress tracking and persistent database recovery.
"""
import asyncio
import hashlib
import json
import re
import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from fastapi import HTTPException, BackgroundTasks
from app.config import settings
from app.constants import VOTE_SCORES, TALLY_APPROVE_THRESHOLD, TALLY_REJECT_THRESHOLD
from app.core.security import redact_sensitive_info
from app.db.session import SessionLocal
from app.models.council import CouncilDecision, ProviderQuota, CouncilCache, CouncilJob
from app.models.user import User
from app.schemas.council import (
    AskCouncilRequest,
    IndividualVote,
    CouncilTally,
    CouncilDecisionOut,
    CouncilJobStatus,
)
from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import scrub_pii_from_text, build_anonymized_council_context
from app.services.council.adapters_factory import get_configured_providers
from app.services.council.base_adapter import BaseProviderAdapter
from app.services.council.health_manager import (
    is_circuit_breaker_active,
    record_provider_success,
    record_provider_failure,
)


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

# In-memory live job progress store
_DELIBERATION_JOBS: Dict[str, Dict[str, Any]] = {}


def _compute_query_hash(user_id: str, question: str, amount: Optional[Decimal], debate: bool, local_only: bool) -> str:
    """Generates a SHA256 query hash for caching identical council inquiries."""
    key = f"{user_id}:{question.strip().lower()}:{str(amount)}:{debate}:{local_only}:{date.today().isoformat()}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _calculate_tally(votes: List[IndividualVote], min_quorum: Optional[int] = None) -> CouncilTally:
    """
    Computes the confidence-weighted tally, enforces quorum requirements, and synthesizes consensus & dissent.
    Scoring: approve=+1.0, approve_with_conditions=+0.5, reject=-1.0.
    If valid votes < min_quorum (default 3), returns 'no_quorum' verdict.
    Calculates dynamic family diversity and warns when fewer than 4 distinct model families participated.
    """
    quorum_threshold = min_quorum if min_quorum is not None else settings.COUNCIL_MIN_QUORUM_VOTES
    successful_votes = [v for v in votes if v.status == "success" and v.verdict is not None]
    skipped_votes = len(votes) - len(successful_votes)

    working_families = {v.model_family for v in successful_votes if v.model_family}
    active_families = sorted(list(working_families))
    active_families_count = len(working_families)

    diversity_warning: Optional[str] = None
    if active_families_count < 4:
        diversity_warning = (
            f"Low council diversity: Only {active_families_count} distinct model "
            f"{'family' if active_families_count == 1 else 'families'} "
            f"({', '.join(active_families) if active_families else 'none'}) participated. "
            "At least 4 distinct families are recommended for robust multi-perspective deliberation."
        )

    # 1. Quorum check
    if len(successful_votes) < quorum_threshold:
        if not successful_votes:
            summary = "All AI Council members were unavailable or rate-limited. Please retry shortly."
        else:
            summary = (
                f"Not enough votes: Only {len(successful_votes)} of {quorum_threshold} required valid votes were collected. "
                "Please retry failed providers to reach quorum."
            )
        return CouncilTally(
            weighted_score=0.0,
            final_verdict="no_quorum",
            consensus_summary=summary,
            key_agreements=[],
            key_disagreements=[],
            is_tie=False,
            total_votes_counted=len(successful_votes),
            total_votes_skipped=skipped_votes,
            min_quorum_required=quorum_threshold,
            has_quorum=False,
            diversity_warning=diversity_warning,
            active_families_count=active_families_count,
            active_families=active_families,
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

        name_label = v.display_name or v.provider_name
        if v.verdict in ("approve", "approve_with_conditions") and v.reasoning:
            approve_reasons.append(f"{name_label}: {v.reasoning}")
        elif v.verdict == "reject" and v.reasoning:
            reject_reasons.append(f"{name_label}: {v.reasoning}")

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
        min_quorum_required=quorum_threshold,
        has_quorum=True,
        diversity_warning=diversity_warning,
        active_families_count=active_families_count,
        active_families=active_families,
    )



def _record_provider_usage(db: Session, votes: List[IndividualVote]):
    """Records daily usage per provider in the ProviderQuota table."""
    today = date.today()
    for v in votes:
        if v.status in ("skipped", "not_configured", "missing_key"):
            continue
        try:
            quota = db.query(ProviderQuota).filter(
                ProviderQuota.provider_name == v.provider_name,
                ProviderQuota.date == today
            ).first()
            if not quota:
                quota = ProviderQuota(
                    provider_name=v.provider_name,
                    date=today,
                    request_count=0,
                    error_count=0,
                )
                db.add(quota)
            quota.request_count += 1
            if v.status != "success":
                quota.error_count += 1
            quota.last_called_at = datetime.now(timezone.utc)
        except Exception:
            pass


def _create_worker_db_session():
    """Returns DB session respecting test dependency overrides if configured."""
    try:
        from main import app
        from app.core.dependencies import get_db
        if get_db in app.dependency_overrides:
            override = app.dependency_overrides[get_db]
            return next(override())
    except Exception:
        pass
    return SessionLocal()


async def _run_deliberation_task(
    job_id: str,
    user_id: str,
    currency: str,
    user_settings: Dict[str, Any],
    request: AskCouncilRequest,
    snapshot: Dict[str, Any],
    sanitized_question: str,
):
    """
    Background worker that runs the multi-round deliberation,
    updates live provider progress, and writes final persisted results to DB.
    """
    db = _create_worker_db_session()
    min_quorum = int(user_settings.get("min_quorum_votes", settings.COUNCIL_MIN_QUORUM_VOTES))

    try:
        anonymized_context = build_anonymized_council_context(snapshot, currency)
        amt_line = f"PROPOSED AMOUNT: {currency} {float(request.candidate_amount):,.2f}\n\n" if request.candidate_amount else ""
        round1_prompt = (
            f"{anonymized_context}\n\n"
            f"USER DECISION / INQUIRY:\n\"{sanitized_question}\"\n"
            f"DECISION TYPE: {request.decision_type.upper()}\n"
            f"{amt_line}"
            f"Please independently evaluate this decision and return your strict JSON vote."
        )

        providers = get_configured_providers(
            user_settings=user_settings,
            local_only_mode=request.local_only_mode,
        )

        if not providers:
            dummy_vote = IndividualVote(
                provider_name="System",
                display_name="System",
                model_id="none",
                model_family="System",
                status="not_configured",
                round_number=1,
                error_message="No AI provider API keys configured in environment or settings.",
            )
            tally = _calculate_tally([dummy_vote], min_quorum=min_quorum)

            decision = db.query(CouncilDecision).filter(CouncilDecision.id == job_id).first()
            if decision:
                decision.status = "completed"
                decision.round1_votes = {"system": dummy_vote.model_dump(mode="json")}
                decision.final_tally = tally.model_dump(mode="json")
                db.commit()
                db.refresh(decision)
                decision_out = CouncilDecisionOut.model_validate(decision)
            else:
                decision_out = None

            # Update DB CouncilJob record
            db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
            if db_job:
                db_job.status = "completed"
                db_job.decision_id = job_id
                db_job.providers_progress = {"system": "Not Configured (No keys)"}
                db_job.updated_at = datetime.now(timezone.utc)
                db.commit()

            if job_id in _DELIBERATION_JOBS:
                _DELIBERATION_JOBS[job_id]["status"] = "completed"
                _DELIBERATION_JOBS[job_id]["decision"] = decision_out
                _DELIBERATION_JOBS[job_id]["providers_progress"] = {"system": "Not Configured (No keys)"}
            return

        has_sufficient = snapshot.get("has_sufficient_data", True)

        # Track provider queries and update progress incrementally
        async def query_with_progress(p: BaseProviderAdapter, prompt: str, sys_inst: str, r_num: int) -> IndividualVote:
            # 1. Check circuit breaker
            tripped, trip_reason, trip_secs = is_circuit_breaker_active(db, p.name)
            if tripped:
                if job_id in _DELIBERATION_JOBS:
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Temporarily skipped ({trip_reason})"
                return IndividualVote(
                    provider_name=p.name,
                    display_name=p.display_name,
                    model_id=p.model_id,
                    model_family=p.model_family,
                    status="skipped",
                    round_number=r_num,
                    error_message=f"Temporarily skipped: Circuit breaker tripped ({trip_reason}). Resets in {trip_secs}s.",
                )

            if job_id in _DELIBERATION_JOBS:
                _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} querying..."
            try:
                res = await p.query(
                    prompt=prompt,
                    system_instruction=sys_inst,
                    timeout_seconds=p.timeout_seconds,
                    round_number=r_num,
                )
                if not has_sufficient and res.confidence is not None and res.confidence > 40:
                    res.confidence = 40
                if job_id in _DELIBERATION_JOBS:
                    status_text = "voted" if res.status == "success" else res.status
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} {status_text}"
                
                # Record health status
                if res.status == "success":
                    record_provider_success(db, p.name)
                elif res.status == "rate_limited":
                    r_secs = None
                    if res.error_message:
                        m = re.search(r'Retry in (\d+) seconds', res.error_message)
                        if m:
                            r_secs = int(m.group(1))
                    record_provider_failure(db, p.name, res.status, retry_after_seconds=r_secs)
                elif res.status in ("timeout", "failed", "error"):
                    record_provider_failure(db, p.name, res.status)

                return res
            except Exception as ex:
                if job_id in _DELIBERATION_JOBS:
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} failed"
                record_provider_failure(db, p.name, "exception")
                return IndividualVote(
                    provider_name=p.name,
                    display_name=p.display_name,
                    model_id=p.model_id,
                    model_family=p.model_family,
                    status="failed",
                    round_number=r_num,
                    error_message=redact_sensitive_info(str(ex)),
                )

        # Round 1
        round1_tasks = [
            query_with_progress(p, round1_prompt, SYSTEM_INSTRUCTION_ROUND1, 1)
            for p in providers
        ]
        round1_results: List[IndividualVote] = await asyncio.gather(*round1_tasks)
        round1_votes_map = {v.provider_name: v.model_dump(mode="json") for v in round1_results}
        _record_provider_usage(db, round1_results)

        # Update DB Job with Round 1 Progress
        try:
            db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
            if db_job:
                db_job.current_round = 1
                if job_id in _DELIBERATION_JOBS:
                    db_job.providers_progress = _DELIBERATION_JOBS[job_id]["providers_progress"]
                db_job.updated_at = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            pass

        # Round 2 Debate (if enabled & >=2 valid votes)
        successful_r1 = [v for v in round1_results if v.status == "success" and v.verdict]
        round2_votes_map = None
        effective_votes = round1_results

        if request.enable_debate and len(successful_r1) >= 2:
            if job_id in _DELIBERATION_JOBS:
                _DELIBERATION_JOBS[job_id]["current_round"] = 2

            try:
                db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
                if db_job:
                    db_job.current_round = 2
                    db_job.updated_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass

            peer_lines = ["PEER COUNCIL MEMBER ROUND 1 POSITIONS:"]
            for v in successful_r1:
                name_label = v.display_name or v.provider_name
                peer_lines.append(
                    f"- {name_label} ({v.model_family}): Voted {v.verdict.upper()} (Confidence: {v.confidence}%) | "
                    f"Reasoning: {v.reasoning} | Identified Risks: {', '.join(v.risks)}"
                )
            peer_summary = "\n".join(peer_lines)

            round2_prompt = (
                f"{round1_prompt}\n\n"
                f"{peer_summary}\n\n"
                f"Review your peers' perspectives above. Provide your final Round 2 vote in strict JSON format."
            )

            round2_tasks = [
                query_with_progress(p, round2_prompt, SYSTEM_INSTRUCTION_ROUND2, 2)
                for p in providers
            ]
            round2_results: List[IndividualVote] = await asyncio.gather(*round2_tasks)
            round2_votes_map = {v.provider_name: v.model_dump(mode="json") for v in round2_results}
            effective_votes = round2_results
            _record_provider_usage(db, round2_results)

        # Final Tally with Quorum Check
        final_tally = _calculate_tally(effective_votes, min_quorum=min_quorum)

        # Update DB CouncilDecision record
        decision = db.query(CouncilDecision).filter(CouncilDecision.id == job_id).first()
        if decision:
            decision.status = "completed"
            decision.round1_votes = round1_votes_map
            decision.round2_votes = round2_votes_map
            decision.final_tally = final_tally.model_dump(mode="json")
            db.commit()
            db.refresh(decision)
            decision_out = CouncilDecisionOut.model_validate(decision)
        else:
            decision_out = None

        # Update DB CouncilJob record
        db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
        if db_job:
            db_job.status = "completed"
            db_job.decision_id = decision.id if decision else job_id
            if job_id in _DELIBERATION_JOBS:
                db_job.providers_progress = _DELIBERATION_JOBS[job_id]["providers_progress"]
            db_job.updated_at = datetime.now(timezone.utc)
            db.commit()

        if job_id in _DELIBERATION_JOBS:
            _DELIBERATION_JOBS[job_id]["status"] = "completed"
            _DELIBERATION_JOBS[job_id]["decision"] = decision_out

    except Exception as e:
        clean_error = redact_sensitive_info(str(e))
        if job_id in _DELIBERATION_JOBS:
            _DELIBERATION_JOBS[job_id]["status"] = "failed"
            _DELIBERATION_JOBS[job_id]["error"] = clean_error

        try:
            db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
            if db_job:
                db_job.status = "failed"
                db_job.error = clean_error
                db_job.updated_at = datetime.now(timezone.utc)
                db.commit()

            decision = db.query(CouncilDecision).filter(CouncilDecision.id == job_id).first()
            if decision:
                decision.status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def create_deliberation_job(
    db: Session,
    user: User,
    request: AskCouncilRequest,
    background_tasks: Optional[BackgroundTasks] = None,
) -> CouncilJobStatus:
    """
    Creates a persistent Council decision job record and starts async deliberation.
    - Enforces 1 active job per user (409 Conflict if active job already running).
    - Checks 5-minute timeout on older active jobs.
    - Returns immediately with CouncilJobStatus containing job_id and initial progress.
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.COUNCIL_JOB_TIMEOUT_SECONDS)

    # 1. Enforce 1 active job per user rule
    active_jobs = db.query(CouncilJob).filter(
        CouncilJob.user_id == user.id,
        CouncilJob.status.in_(["pending", "running"]),
    ).all()

    for aj in active_jobs:
        c_at = aj.created_at
        if c_at.tzinfo is None:
            c_at = c_at.replace(tzinfo=timezone.utc)
        if c_at < cutoff:
            aj.status = "failed"
            aj.error = f"Deliberation timed out after {settings.COUNCIL_JOB_TIMEOUT_SECONDS // 60} minutes."
            aj.updated_at = now
        else:
            raise HTTPException(
                status_code=409,
                detail=f"An active council deliberation (Job ID: {aj.id}) is already in progress. Please wait for it to complete or cancel it.",
            )
    db.commit()

    user_settings = user.settings or {}
    max_dti = float(user_settings.get("max_dti_ratio", settings.DEFAULT_MAX_DTI_RATIO))
    min_runway = float(user_settings.get("min_runway_months", settings.DEFAULT_MIN_RUNWAY_MONTHS))

    # 2. Deterministic Financial Snapshot
    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=user.id,
        candidate_amount=request.candidate_amount,
        decision_type=request.decision_type,
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    # 3. Anonymize context
    sanitized_question = scrub_pii_from_text(request.question)

    job_id = str(uuid.uuid4())
    total_rounds = 2 if request.enable_debate else 1

    # Check configured providers to initialize progress map
    providers = get_configured_providers(
        user_settings=user_settings,
        local_only_mode=request.local_only_mode,
    )
    initial_progress = {p.name: "Pending" for p in providers} if providers else {"system": "Not Configured"}

    # 4. Create persistent DB CouncilJob record
    db_job = CouncilJob(
        id=job_id,
        user_id=user.id,
        status="running",
        current_round=1,
        total_rounds=total_rounds,
        providers_progress=initial_progress,
        error=None,
        created_at=now,
        updated_at=now,
    )
    db.add(db_job)

    # 5. Create persistent DB CouncilDecision record
    decision = CouncilDecision(
        id=job_id,
        user_id=user.id,
        question=sanitized_question,
        decision_type=request.decision_type,
        candidate_amount=request.candidate_amount,
        enable_debate=request.enable_debate,
        local_only_mode=request.local_only_mode,
        status="running",
        financial_snapshot=snapshot,
        round1_votes={},
        round2_votes=None,
        final_tally={},
        guardrail_breach=snapshot if snapshot.get("guardrail_breached") else None,
    )
    db.add(decision)
    db.commit()

    # 6. Initialize in-memory tracker
    _DELIBERATION_JOBS[job_id] = {
        "job_id": job_id,
        "user_id": user.id,
        "status": "running",
        "current_round": 1,
        "total_rounds": total_rounds,
        "providers_progress": initial_progress,
        "decision": None,
        "error": None,
    }

    # 7. Launch background task
    if background_tasks is not None:
        background_tasks.add_task(
            _run_deliberation_task,
            job_id=job_id,
            user_id=user.id,
            currency=user.currency,
            user_settings=user_settings,
            request=request,
            snapshot=snapshot,
            sanitized_question=sanitized_question,
        )
    else:
        asyncio.create_task(
            _run_deliberation_task(
                job_id=job_id,
                user_id=user.id,
                currency=user.currency,
                user_settings=user_settings,
                request=request,
                snapshot=snapshot,
                sanitized_question=sanitized_question,
            )
        )

    return CouncilJobStatus(
        job_id=job_id,
        status="running",
        current_round=1,
        total_rounds=total_rounds,
        providers_progress=initial_progress,
        decision=None,
        error=None,
    )


def get_deliberation_job_status(
    db: Session,
    user_id: str,
    job_id: str,
) -> Optional[CouncilJobStatus]:
    """
    Retrieves the status of a running or completed deliberation job.
    Queries the database by job_id and user_id to strictly enforce ownership.
    Enforces maximum lifetime timeout on hanging jobs and returns fresh progress.
    """
    # 1. Query CouncilJob by job_id and user_id
    job = db.query(CouncilJob).filter(
        CouncilJob.id == job_id,
        CouncilJob.user_id == user_id,
    ).first()

    if not job:
        return None

    now = datetime.now(timezone.utc)
    c_at = job.created_at
    if c_at.tzinfo is None:
        c_at = c_at.replace(tzinfo=timezone.utc)

    # 2. Check max lifetime (5 minutes)
    if job.status in ("pending", "running") and (now - c_at).total_seconds() > settings.COUNCIL_JOB_TIMEOUT_SECONDS:
        job.status = "failed"
        job.error = f"Deliberation timed out after {settings.COUNCIL_JOB_TIMEOUT_SECONDS // 60} minutes."
        job.updated_at = now
        db.commit()

    # 3. Pull live memory progress if active
    providers_progress = job.providers_progress or {}
    current_round = job.current_round
    if job_id in _DELIBERATION_JOBS:
        mem = _DELIBERATION_JOBS[job_id]
        if mem.get("providers_progress"):
            providers_progress = mem["providers_progress"]
        current_round = mem.get("current_round", current_round)

    # 4. Load completed decision if available
    decision_out = None
    if job.status == "completed":
        target_decision_id = job.decision_id or job.id
        decision = (
            db.query(CouncilDecision)
            .filter(CouncilDecision.id == target_decision_id, CouncilDecision.user_id == user_id)
            .first()
        )
        if decision:
            decision_out = CouncilDecisionOut.model_validate(decision)

    return CouncilJobStatus(
        job_id=job.id,
        status=job.status,
        current_round=current_round,
        total_rounds=job.total_rounds,
        providers_progress=providers_progress,
        decision=decision_out,
        error=job.error,
    )


def cancel_deliberation_job(
    db: Session,
    user_id: str,
    job_id: str,
) -> CouncilJobStatus:
    """
    Cancels a pending or running deliberation job and frees the user's active-job slot.
    Checks auth/ownership (404 if not found).
    """
    job = db.query(CouncilJob).filter(
        CouncilJob.id == job_id,
        CouncilJob.user_id == user_id,
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Council deliberation job not found.")

    now = datetime.now(timezone.utc)
    if job.status in ("pending", "running"):
        job.status = "cancelled"
        job.error = "Deliberation cancelled by user."
        job.updated_at = now

        # Also cancel corresponding decision if running
        decision_id = job.decision_id or job.id
        decision = db.query(CouncilDecision).filter(
            CouncilDecision.id == decision_id,
            CouncilDecision.user_id == user_id,
        ).first()
        if decision and decision.status == "running":
            decision.status = "cancelled"

        db.commit()

    if job_id in _DELIBERATION_JOBS:
        _DELIBERATION_JOBS[job_id]["status"] = "cancelled"
        _DELIBERATION_JOBS[job_id]["error"] = "Deliberation cancelled by user."

    providers_progress = job.providers_progress or {}
    if job_id in _DELIBERATION_JOBS and _DELIBERATION_JOBS[job_id].get("providers_progress"):
        providers_progress = _DELIBERATION_JOBS[job_id]["providers_progress"]

    return CouncilJobStatus(
        job_id=job.id,
        status=job.status,
        current_round=job.current_round,
        total_rounds=job.total_rounds,
        providers_progress=providers_progress,
        decision=None,
        error=job.error,
    )


def create_retry_job(
    db: Session,
    user: User,
    decision_id: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> CouncilJobStatus:
    """
    Creates an asynchronous background retry job for failed providers:
    - Verifies ownership of decision_id (404 if not found or unauthorized).
    - Enforces 1 active job per user rule (409 Conflict if active job already running).
    - Re-queries ONLY providers that failed, timed out, or had no verdict.
    - Preserves successful votes, records provider quota, and updates consensus.
    """
    decision = db.query(CouncilDecision).filter(
        CouncilDecision.id == decision_id,
        CouncilDecision.user_id == user.id,
    ).first()
    if not decision:
        raise HTTPException(status_code=404, detail="Council decision not found.")

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=settings.COUNCIL_JOB_TIMEOUT_SECONDS)

    # Enforce 1 active job per user rule
    active_jobs = db.query(CouncilJob).filter(
        CouncilJob.user_id == user.id,
        CouncilJob.status.in_(["pending", "running"]),
    ).all()

    for aj in active_jobs:
        c_at = aj.created_at
        if c_at.tzinfo is None:
            c_at = c_at.replace(tzinfo=timezone.utc)
        if c_at < cutoff:
            aj.status = "failed"
            aj.error = f"Deliberation timed out after {settings.COUNCIL_JOB_TIMEOUT_SECONDS // 60} minutes."
            aj.updated_at = now
        else:
            raise HTTPException(
                status_code=409,
                detail=f"An active council deliberation (Job ID: {aj.id}) is already in progress. Please wait for it to complete or cancel it.",
            )
    db.commit()

    user_settings = user.settings or {}
    all_providers = get_configured_providers(
        user_settings=user_settings,
        local_only_mode=decision.local_only_mode,
    )
    r1_votes_raw = decision.round1_votes or {}

    initial_progress: Dict[str, str] = {}
    for p in all_providers:
        v_data = r1_votes_raw.get(p.name)
        if not v_data or v_data.get("status") != "success" or not v_data.get("verdict"):
            initial_progress[p.name] = "Pending Retry"
        else:
            initial_progress[p.name] = "Vote Preserved"

    if not initial_progress:
        initial_progress = {"system": "No failed providers"}

    job_id = str(uuid.uuid4())
    total_rounds = 2 if decision.enable_debate else 1

    db_job = CouncilJob(
        id=job_id,
        user_id=user.id,
        decision_id=decision.id,
        status="running",
        current_round=1,
        total_rounds=total_rounds,
        providers_progress=initial_progress,
        error=None,
        created_at=now,
        updated_at=now,
    )
    db.add(db_job)
    decision.status = "running"
    db.commit()

    _DELIBERATION_JOBS[job_id] = {
        "job_id": job_id,
        "user_id": user.id,
        "decision_id": decision.id,
        "status": "running",
        "current_round": 1,
        "total_rounds": total_rounds,
        "providers_progress": initial_progress,
        "decision": None,
        "error": None,
    }

    if background_tasks is not None:
        background_tasks.add_task(
            _run_retry_task,
            job_id=job_id,
            user_id=user.id,
            decision_id=decision.id,
            currency=user.currency,
            user_settings=user_settings,
        )
    else:
        asyncio.create_task(
            _run_retry_task(
                job_id=job_id,
                user_id=user.id,
                decision_id=decision.id,
                currency=user.currency,
                user_settings=user_settings,
            )
        )

    return CouncilJobStatus(
        job_id=job_id,
        status="running",
        current_round=1,
        total_rounds=total_rounds,
        providers_progress=initial_progress,
        decision=None,
        error=None,
    )


async def _run_retry_task(
    job_id: str,
    user_id: str,
    decision_id: str,
    currency: str,
    user_settings: Dict[str, Any],
) -> None:
    db = SessionLocal()
    try:
        decision = db.query(CouncilDecision).filter(
            CouncilDecision.id == decision_id,
            CouncilDecision.user_id == user_id,
        ).first()
        if not decision:
            return

        min_quorum = int(user_settings.get("min_quorum_votes", settings.COUNCIL_MIN_QUORUM_VOTES))
        r1_votes_raw = decision.round1_votes or {}
        all_providers = get_configured_providers(
            user_settings=user_settings,
            local_only_mode=decision.local_only_mode,
        )

        failed_adapters: List[BaseProviderAdapter] = []
        for p in all_providers:
            v_data = r1_votes_raw.get(p.name)
            if not v_data or v_data.get("status") != "success" or not v_data.get("verdict"):
                failed_adapters.append(p)

        snapshot = decision.financial_snapshot or {}
        has_sufficient = snapshot.get("has_sufficient_data", True)
        anonymized_context = build_anonymized_council_context(snapshot, currency)
        amt_line = f"PROPOSED AMOUNT: {currency} {float(decision.candidate_amount):,.2f}\n\n" if decision.candidate_amount else ""
        round1_prompt = (
            f"{anonymized_context}\n\n"
            f"USER DECISION / INQUIRY:\n\"{decision.question}\"\n"
            f"DECISION TYPE: {decision.decision_type.upper()}\n"
            f"{amt_line}"
            f"Please independently evaluate this decision and return your strict JSON vote."
        )

        async def query_with_progress(p: BaseProviderAdapter, prompt: str, sys_inst: str, r_num: int) -> IndividualVote:
            # 1. Check circuit breaker
            tripped, trip_reason, trip_secs = is_circuit_breaker_active(db, p.name)
            if tripped:
                if job_id in _DELIBERATION_JOBS:
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Temporarily skipped ({trip_reason})"
                return IndividualVote(
                    provider_name=p.name,
                    display_name=p.display_name,
                    model_id=p.model_id,
                    model_family=p.model_family,
                    status="skipped",
                    round_number=r_num,
                    error_message=f"Temporarily skipped: Circuit breaker tripped ({trip_reason}). Resets in {trip_secs}s.",
                )

            if job_id in _DELIBERATION_JOBS:
                _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} retrying..."
            try:
                res = await p.query(
                    prompt=prompt,
                    system_instruction=sys_inst,
                    timeout_seconds=p.timeout_seconds,
                    round_number=r_num,
                )
                if not has_sufficient and res.confidence is not None and res.confidence > 40:
                    res.confidence = 40
                if job_id in _DELIBERATION_JOBS:
                    status_text = "voted" if res.status == "success" else res.status
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} {status_text}"
                
                # Record health status
                if res.status == "success":
                    record_provider_success(db, p.name)
                elif res.status == "rate_limited":
                    r_secs = None
                    if res.error_message:
                        m = re.search(r'Retry in (\d+) seconds', res.error_message)
                        if m:
                            r_secs = int(m.group(1))
                    record_provider_failure(db, p.name, res.status, retry_after_seconds=r_secs)
                elif res.status in ("timeout", "failed", "error"):
                    record_provider_failure(db, p.name, res.status)

                return res
            except Exception as ex:
                if job_id in _DELIBERATION_JOBS:
                    _DELIBERATION_JOBS[job_id]["providers_progress"][p.name] = f"Round {r_num} failed"
                record_provider_failure(db, p.name, "exception")
                return IndividualVote(
                    provider_name=p.name,
                    display_name=p.display_name,
                    model_id=p.model_id,
                    model_family=p.model_family,
                    status="failed",
                    round_number=r_num,
                    error_message=redact_sensitive_info(str(ex)),
                )

        if failed_adapters:
            round1_tasks = [
                query_with_progress(p, round1_prompt, SYSTEM_INSTRUCTION_ROUND1, 1)
                for p in failed_adapters
            ]
            retry_results: List[IndividualVote] = await asyncio.gather(*round1_tasks)
            _record_provider_usage(db, retry_results)

            merged_r1_map = dict(r1_votes_raw)
            for v in retry_results:
                merged_r1_map[v.provider_name] = v.model_dump(mode="json")
            decision.round1_votes = merged_r1_map
        else:
            merged_r1_map = dict(r1_votes_raw)

        all_r1_objs = [IndividualVote.model_validate(v) for v in merged_r1_map.values()]
        successful_r1 = [v for v in all_r1_objs if v.status == "success" and v.verdict]
        effective_votes = all_r1_objs

        if decision.enable_debate and len(successful_r1) >= 2:
            if job_id in _DELIBERATION_JOBS:
                _DELIBERATION_JOBS[job_id]["current_round"] = 2
            try:
                db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
                if db_job:
                    db_job.current_round = 2
                    db_job.updated_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                pass

            peer_lines = ["PEER COUNCIL MEMBER ROUND 1 POSITIONS:"]
            for v in successful_r1:
                name_label = v.display_name or v.provider_name
                peer_lines.append(
                    f"- {name_label} ({v.model_family}): Voted {v.verdict.upper()} (Confidence: {v.confidence}%) | "
                    f"Reasoning: {v.reasoning} | Identified Risks: {', '.join(v.risks)}"
                )
            peer_summary = "\n".join(peer_lines)
            round2_prompt = (
                f"{round1_prompt}\n\n"
                f"{peer_summary}\n\n"
                f"Review your peers' perspectives above. Provide your final Round 2 vote in strict JSON format."
            )
            round2_tasks = [
                query_with_progress(p, round2_prompt, SYSTEM_INSTRUCTION_ROUND2, 2)
                for p in all_providers
            ]
            round2_results: List[IndividualVote] = await asyncio.gather(*round2_tasks)
            decision.round2_votes = {v.provider_name: v.model_dump(mode="json") for v in round2_results}
            effective_votes = round2_results
            _record_provider_usage(db, round2_results)

        final_tally = _calculate_tally(effective_votes, min_quorum=min_quorum)
        decision.final_tally = final_tally.model_dump(mode="json")
        decision.status = "completed"
        db.commit()
        db.refresh(decision)
        decision_out = CouncilDecisionOut.model_validate(decision)

        db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
        if db_job:
            db_job.status = "completed"
            db_job.decision_id = decision.id
            if job_id in _DELIBERATION_JOBS:
                db_job.providers_progress = _DELIBERATION_JOBS[job_id]["providers_progress"]
            db_job.updated_at = datetime.now(timezone.utc)
            db.commit()

        if job_id in _DELIBERATION_JOBS:
            _DELIBERATION_JOBS[job_id]["status"] = "completed"
            _DELIBERATION_JOBS[job_id]["decision"] = decision_out

    except Exception as e:
        clean_error = redact_sensitive_info(str(e))
        if job_id in _DELIBERATION_JOBS:
            _DELIBERATION_JOBS[job_id]["status"] = "failed"
            _DELIBERATION_JOBS[job_id]["error"] = clean_error
        try:
            db_job = db.query(CouncilJob).filter(CouncilJob.id == job_id).first()
            if db_job:
                db_job.status = "failed"
                db_job.error = clean_error
                db_job.updated_at = datetime.now(timezone.utc)
                db.commit()
            decision = db.query(CouncilDecision).filter(CouncilDecision.id == decision_id).first()
            if decision:
                decision.status = "completed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


async def retry_failed_providers_for_decision(
    db: Session,
    user: User,
    decision_id: str,
) -> CouncilDecisionOut:
    """
    Synchronous / direct helper for retrying failed providers, awaiting completion.
    """
    job_status = create_retry_job(db=db, user=user, decision_id=decision_id)
    job_id = job_status.job_id

    while True:
        await asyncio.sleep(0.1)
        st = get_deliberation_job_status(db=db, user_id=user.id, job_id=job_id)
        if not st or st.status in ("completed", "failed"):
            if st and st.decision:
                return st.decision
            decision = (
                db.query(CouncilDecision)
                .filter(CouncilDecision.id == decision_id, CouncilDecision.user_id == user.id)
                .first()
            )
            if decision:
                return CouncilDecisionOut.model_validate(decision)
            raise RuntimeError(f"Retry failed: {st.error if st else 'Unknown error'}")


async def execute_council_deliberation(
    db: Session,
    user: User,
    request: AskCouncilRequest,
) -> CouncilDecisionOut:
    """
    Direct synchronous orchestration of the Council pipeline (for direct calls/tests).
    """
    job_status = create_deliberation_job(db=db, user=user, request=request)
    job_id = job_status.job_id

    # Wait for background task to finish
    while True:
        await asyncio.sleep(0.1)
        st = get_deliberation_job_status(db=db, user_id=user.id, job_id=job_id)
        if not st or st.status in ("completed", "failed"):
            if st and st.decision:
                return st.decision
            decision = (
                db.query(CouncilDecision)
                .filter(CouncilDecision.id == job_id, CouncilDecision.user_id == user.id)
                .first()
            )
            if decision:
                return CouncilDecisionOut.model_validate(decision)
            raise RuntimeError(f"Deliberation failed: {st.error if st else 'Unknown error'}")
