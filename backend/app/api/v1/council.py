"""
AI Council API Endpoints for deliberation requests, background job polling,
provider connection testing, provider status, history, and user final say.
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.core.limiter import limiter
from app.core.dependencies import get_db, get_current_user, verify_csrf
from app.models.user import User
from app.models.council import CouncilDecision
from app.schemas.council import (
    AskCouncilRequest,
    CouncilDecisionOut,
    CouncilJobStatus,
    TestConnectionRequest,
    TestConnectionResponse,
    UserDecisionSubmit,
    ProviderStatusItem,
    ProviderSettingOut,
    UpdateProviderModelRequest,
    ProviderModelHistoryRevertRequest,
    RecommendedModelItem,
    UpdateRecommendedListRequest,
    FindWorkingModelsResponse,
    UseRecommendedResponse,
    FixAllResponse,
    ModelSwitchLogOut,
    AutoSwitchSettingUpdate,
    CouncilAppSettingOut,
)
from app.services.council.engine import (
    create_deliberation_job,
    create_retry_job,
    cancel_deliberation_job,
    get_deliberation_job_status,
    execute_council_deliberation,
    retry_failed_providers_for_decision,
)
from app.services.council.health_manager import (
    is_circuit_breaker_active,
    reset_circuit_breaker,
)
from app.services.council.connection_tester import verify_provider_connectivity
from app.services.financial_math import calculate_user_financial_snapshot
from app.services.privacy import scrub_pii_from_text, build_anonymized_council_context

router = APIRouter(prefix="/council", tags=["AI Council"])


@router.get("/providers", response_model=List[ProviderStatusItem])
async def list_council_providers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the configuration status, median TTFT, fallback model, sampling parameters, and model family details for all AI Council providers."""
    from datetime import date
    from app.models.council import ProviderQuota, ProviderCircuitBreaker
    from app.services.council.adapters_factory import (
        derive_model_family,
        get_resolved_provider_config,
    )
    from app.services.council.health_manager import get_provider_median_ttft

    is_hosted = settings.is_hosted
    user_settings = current_user.settings or {}

    # Fetch today's quotas from DB
    today = date.today()
    quotas_db = db.query(ProviderQuota).filter(ProviderQuota.date == today).all()
    quota_map = {q.provider_name: q.request_count for q in quotas_db}

    # Fetch circuit breakers
    cbs_db = db.query(ProviderCircuitBreaker).all()
    cb_map = {cb.provider_name: cb for cb in cbs_db}

    # Free-only provider definitions
    slot_keys = [
        ("gemini", "Google Gemini", False, 1500, None),
        ("groq_1", "Groq Primary", False, 14400, None),
        ("groq_2", "Groq Secondary", False, 14400, "Groq Key"),
        ("openrouter_1", "OpenRouter Primary", False, 200, None),
        ("openrouter_2", "OpenRouter Secondary", False, 200, "OpenRouter Key"),
        ("nvidia_1", "NVIDIA NIM (Muse)", False, 1000, "NVIDIA NIM Key"),
        ("nvidia_2", "NVIDIA NIM (Secondary)", False, 1000, "NVIDIA NIM Key"),
        ("custom_1", "Custom Slot 1", False, None, None),
        ("custom_2", "Custom Slot 2", False, None, None),
        ("ollama", "Ollama (Local Offline)", True, None, None),
    ]

    providers_info: List[ProviderStatusItem] = []

    for slot_key, default_display, is_local, limit, shares_key in slot_keys:
        cfg = get_resolved_provider_config(slot_key, db=db, user_settings=user_settings)
        req_count = quota_map.get(slot_key, 0)
        model_id = cfg.get("model_id") or ""
        fallback_model_id = cfg.get("fallback_model_id")
        has_model = bool(model_id and model_id.strip())

        # Check API key presence
        has_key = True
        if slot_key == "gemini":
            has_key = bool(settings.GEMINI_API_KEY)
        elif slot_key in ("groq_1", "groq_2"):
            has_key = bool(settings.GROQ_API_KEY)
        elif slot_key in ("openrouter_1", "openrouter_2"):
            has_key = bool(settings.OPENROUTER_API_KEY)
        elif slot_key in ("nvidia_1", "nvidia_2"):
            has_key = bool(settings.NVIDIA_API_KEY)
        elif slot_key in ("custom_1", "custom_2"):
            env_var = cfg.get("env_key_name") or ""
            has_key = bool(env_var and os.environ.get(env_var))
        elif is_local:
            has_key = True

        if is_local and is_hosted:
            status_val = "disabled_in_hosted"
            is_configured = False
        elif not has_key:
            status_val = "missing_key"
            is_configured = False
        elif not has_model:
            status_val = "missing_model_id"
            is_configured = False
        else:
            status_val = "ready"
            is_configured = True

        # Check circuit breaker
        cb = cb_map.get(slot_key)
        cb_tripped = False
        cb_reason = None
        cb_secs = None
        if cb and cb.is_tripped:
            cb_tripped = True
            cb_reason = cb.last_failure_reason
            if cb.tripped_until:
                now_utc = datetime.now(timezone.utc)
                until_utc = cb.tripped_until if cb.tripped_until.tzinfo is not None else cb.tripped_until.replace(tzinfo=timezone.utc)
                if until_utc > now_utc:
                    cb_secs = int((until_utc - now_utc).total_seconds())
                    status_val = "circuit_breaker_tripped"

        # Check last test result for status enhancement
        if cb and cb.last_test_result and isinstance(cb.last_test_result, dict):
            last_st = cb.last_test_result.get("status")
            if last_st == "success" and status_val == "ready":
                status_val = "working"
            elif last_st in ("invalid_key", "model_not_found", "bad_json", "error") and status_val == "ready":
                status_val = "failed"

        # TTFT & Slow flag
        median_ttft = get_provider_median_ttft(db, slot_key)
        is_slow = bool(median_ttft and median_ttft > 30000)
        if is_slow and status_val in ("ready", "working"):
            status_val = "slow"

        # Family derivation
        fam = cfg.get("family") or derive_model_family(model_id, slot_key)

        is_near_limit = bool(limit and req_count >= (limit * 0.8))

        providers_info.append(
            ProviderStatusItem(
                name=slot_key,
                display_name=cfg.get("display_name") or default_display,
                model_family=fam,
                model_id=model_id,
                fallback_model_id=fallback_model_id,
                is_configured=is_configured,
                is_local=is_local,
                has_key=has_key,
                daily_request_count=req_count,
                daily_quota_limit=limit,
                is_near_limit=is_near_limit,
                shares_key_with=shares_key,
                status=status_val,
                circuit_breaker_tripped=cb_tripped,
                circuit_breaker_reason=cb_reason,
                circuit_breaker_resets_in_seconds=cb_secs,
                median_ttft_ms=median_ttft,
                is_slow=is_slow,
                enabled_in_council=bool(cfg.get("enabled", True)),
                confirmed_free=bool(cfg.get("confirmed_free", False)),
                history=list(cfg.get("history") or []),
                base_url=cfg.get("base_url"),
                env_key_name=cfg.get("env_key_name"),
                exclude_slow_round2=bool(cfg.get("exclude_slow_round2", False)),
                temperature=float(cfg.get("temperature", 0.5)),
                top_p=float(cfg.get("top_p", 0.95)),
                max_tokens=int(cfg.get("max_tokens", 4096)),
            )
        )

    return providers_info


@router.put("/providers/{provider_name}/model", response_model=ProviderSettingOut, dependencies=[Depends(verify_csrf)])
async def update_council_provider_model(
    provider_name: str,
    payload: UpdateProviderModelRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates provider model and settings:
    - Validates target model against live catalog & runs a test probe before saving.
    - Prevents saving non-free models (rejects paid OpenRouter models or unconfirmed models).
    - Preserves previous working model as fallback & appends to last 5 history for one-tap revert.
    """
    from app.models.council import ProviderSetting, FreeTierAllowlist, RecommendedModel
    from app.services.council.connection_tester import verify_provider_connectivity
    from app.services.council.adapters_factory import derive_model_family
    from app.services.council.ssrf_protection import validate_custom_endpoint_url

    p_key = provider_name.lower().strip()
    target_model = payload.model_id.strip()

    # SSRF protection validation for custom slots
    if p_key in ("custom_1", "custom_2") and payload.base_url:
        is_valid_url, url_err = validate_custom_endpoint_url(payload.base_url)
        if not is_valid_url:
            raise HTTPException(status_code=400, detail=f"SSRF Protection Error: {url_err}")

    # Fetch existing setting
    setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == p_key).first()
    old_model = setting.model_id if setting else ""

    # Check free-only eligibility
    if not payload.confirmed_free:
        is_rec = db.query(RecommendedModel).filter(
            RecommendedModel.provider_name == p_key,
            RecommendedModel.model_id == target_model,
        ).first()
        is_allow = db.query(FreeTierAllowlist).filter(
            FreeTierAllowlist.model_id == target_model,
        ).first()
        if not is_rec and not is_allow and not (p_key.startswith("openrouter") and ":free" in target_model.lower()):
            raise HTTPException(
                status_code=400,
                detail="This model is not in the confirmed free list. Please tick 'I confirmed this is free' to save."
            )

    # If model is changing, run test probe before saving unless forced
    if (not old_model or old_model != target_model) and not payload.force_skip_test:
        test_res = await verify_provider_connectivity(
            provider_name=p_key,
            model_id=target_model,
            user_settings=current_user.settings or {},
            db=db,
        )
        if test_res.status != "success":
            raise HTTPException(
                status_code=400,
                detail=f"Model verification probe failed ({test_res.status}): {test_res.diagnosis}"
            )
        if p_key.startswith("openrouter") and test_res.is_free is False and ":free" not in target_model.lower():
            raise HTTPException(
                status_code=400,
                detail="Paid OpenRouter models are not allowed. Free-only policy requires $0.00 pricing or :free ID."
            )

    # Derive family
    fam = payload.family_override or derive_model_family(target_model, p_key)

    # Manage history (last 5)
    history_list: List[str] = list(setting.history or []) if setting else []
    if old_model and old_model != target_model:
        if old_model in history_list:
            history_list.remove(old_model)
        history_list.insert(0, old_model)
        history_list = history_list[:5]

    # Set fallback model
    fallback = payload.fallback_model_id or (old_model if old_model != target_model else (setting.fallback_model_id if setting else None))

    if not setting:
        setting = ProviderSetting(
            provider_key=p_key,
            model_id=target_model,
            fallback_model_id=fallback,
            family_override=fam,
            enabled=payload.enabled if payload.enabled is not None else True,
            timeout=payload.timeout or 25,
            temperature=payload.temperature if payload.temperature is not None else 0.5,
            top_p=payload.top_p if payload.top_p is not None else 0.95,
            max_tokens=payload.max_tokens if payload.max_tokens is not None else 4096,
            confirmed_free=bool(payload.confirmed_free),
            history=history_list,
            display_name=payload.display_name,
            base_url=payload.base_url,
            env_key_name=payload.env_key_name,
            exclude_slow_round2=bool(payload.exclude_slow_round2),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(setting)
    else:
        setting.model_id = target_model
        if payload.fallback_model_id is not None:
            setting.fallback_model_id = payload.fallback_model_id
        elif fallback:
            setting.fallback_model_id = fallback
        if payload.family_override is not None:
            setting.family_override = fam
        if payload.enabled is not None:
            setting.enabled = payload.enabled
        if payload.timeout is not None:
            setting.timeout = payload.timeout
        if payload.temperature is not None:
            setting.temperature = payload.temperature
        if payload.top_p is not None:
            setting.top_p = payload.top_p
        if payload.max_tokens is not None:
            setting.max_tokens = payload.max_tokens
        if payload.confirmed_free is not None:
            setting.confirmed_free = payload.confirmed_free
        if payload.display_name is not None:
            setting.display_name = payload.display_name
        if payload.base_url is not None:
            setting.base_url = payload.base_url
        if payload.env_key_name is not None:
            setting.env_key_name = payload.env_key_name
        if payload.exclude_slow_round2 is not None:
            setting.exclude_slow_round2 = payload.exclude_slow_round2
        setting.history = history_list
        setting.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(setting)
    return setting


@router.post("/providers/{provider_name}/revert", response_model=ProviderSettingOut, dependencies=[Depends(verify_csrf)])
async def revert_council_provider_model(
    provider_name: str,
    payload: ProviderModelHistoryRevertRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reverts a provider's model to a specified previous model from history."""
    from app.models.council import ProviderSetting
    from app.services.council.adapters_factory import derive_model_family

    p_key = provider_name.lower().strip()
    target_mid = payload.model_id.strip()

    setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == p_key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Provider settings not found.")

    current_mid = setting.model_id or ""
    history_list: List[str] = list(setting.history or [])

    if current_mid and current_mid != target_mid:
        if current_mid in history_list:
            history_list.remove(current_mid)
        history_list.insert(0, current_mid)
        history_list = history_list[:5]

    setting.model_id = target_mid
    setting.family_override = derive_model_family(target_mid, p_key)
    setting.history = history_list
    setting.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(setting)
    return setting


@router.get("/recommended", response_model=Dict[str, List[RecommendedModelItem]])
async def get_recommended_council_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves the recommended patterns and their runtime live catalog resolution status for all providers."""
    from app.models.council import ProviderCircuitBreaker
    from app.services.council.pattern_resolver import (
        get_patterns_for_provider,
        resolve_provider_recommended_patterns,
    )
    from app.services.council.connection_tester import verify_provider_connectivity

    cbs = db.query(ProviderCircuitBreaker).all()
    cb_ttfts = {cb.provider_name: cb.median_ttft_ms for cb in cbs}

    provider_keys = [
        "gemini", "groq", "openrouter", "nvidia",
        "groq_1", "groq_2", "openrouter_1", "openrouter_2", "nvidia_1", "nvidia_2"
    ]
    res: Dict[str, List[RecommendedModelItem]] = {}

    for p_name in ["gemini", "groq", "openrouter", "nvidia"]:
        patterns = get_patterns_for_provider(p_name, db=db)
        if not patterns:
            continue

        catalog_models = []
        try:
            test_probe = await verify_provider_connectivity(
                provider_name=p_name,
                db=db,
                user_settings=current_user.settings or {},
            )
            catalog_models = list(test_probe.free_models if test_probe.free_models else (test_probe.close_matches or []))
            if test_probe.model_id and test_probe.model_id not in catalog_models:
                catalog_models.append(test_probe.model_id)
        except Exception:
            catalog_models = []

        resolved_records = resolve_provider_recommended_patterns(
            provider_name=p_name,
            patterns=patterns,
            catalog_models=catalog_models,
        )

        items = []
        for r in resolved_records:
            items.append(
                RecommendedModelItem(
                    provider_name=p_name,
                    pattern=r["pattern"],
                    resolved_model_id=r["resolved_model_id"],
                    model_id=r["resolved_model_id"] if r["resolved_model_id"] else r["pattern"],
                    status=r["status"],
                    sort_order=r["sort_order"],
                    last_test_badge="untested",
                    median_ttft_ms=cb_ttfts.get(p_name),
                    in_live_catalog=r["in_live_catalog"],
                    is_free=True,
                )
            )
        res[p_name] = items

    # Mirror for slot keys so frontend can query by either groq or groq_1
    res["groq_1"] = res.get("groq", [])
    res["groq_2"] = res.get("groq", [])
    res["openrouter_1"] = res.get("openrouter", [])
    res["openrouter_2"] = res.get("openrouter", [])
    res["nvidia_1"] = res.get("nvidia", [])
    res["nvidia_2"] = res.get("nvidia", [])

    return res


@router.put("/providers/{provider_name}/recommended", dependencies=[Depends(verify_csrf)])
async def update_provider_recommended_models(
    provider_name: str,
    payload: UpdateRecommendedListRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates (reorders, adds, removes) the recommended models list for a provider."""
    from app.models.council import RecommendedModel

    p_key = provider_name.lower().strip()
    db.query(RecommendedModel).filter(RecommendedModel.provider_name == p_key).delete()

    for idx, mid in enumerate(payload.models):
        mid_clean = mid.strip()
        if mid_clean:
            item = RecommendedModel(
                provider_name=p_key,
                model_id=mid_clean,
                sort_order=idx,
            )
            db.add(item)

    db.commit()
    return {"status": "ok", "provider_name": p_key, "count": len(payload.models)}


@router.post("/providers/{provider_name}/use-recommended", response_model=UseRecommendedResponse, dependencies=[Depends(verify_csrf)])
async def apply_use_recommended_for_provider(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tests recommended models in order, saves and activates the first one that passes.
    Returns attempt results and final status.
    """
    from app.services.council.connection_tester import use_recommended_for_provider

    success, applied_mid, attempts, msg = await use_recommended_for_provider(
        provider_name=provider_name,
        db=db,
        user_settings=current_user.settings or {},
    )

    return UseRecommendedResponse(
        provider_name=provider_name,
        applied_model_id=applied_mid,
        attempts=attempts,
        success=success,
        message=msg,
    )


@router.post("/providers/{provider_name}/find-working", response_model=FindWorkingModelsResponse, dependencies=[Depends(verify_csrf)])
async def find_working_candidates_endpoint(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Discovers and tests working candidates (recommended + ranked catalog) for a provider."""
    from app.services.council.connection_tester import find_working_candidates_for_provider

    candidates = await find_working_candidates_for_provider(
        provider_name=provider_name,
        db=db,
        user_settings=current_user.settings or {},
    )

    return FindWorkingModelsResponse(
        provider_name=provider_name,
        tested_candidates=candidates,
        message=f"Tested {len(candidates)} candidate models.",
    )


@router.post("/providers/fix-all", response_model=FixAllResponse, dependencies=[Depends(verify_csrf)])
async def fix_all_council_providers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Runs automated fix for all failed or unconfigured council voters:
    Iterates recommended list, tests and applies working models.
    """
    from app.services.council.connection_tester import fix_all_providers

    result = await fix_all_providers(db=db, user_settings=current_user.settings or {})
    return result


@router.get("/settings/auto-switch", response_model=CouncilAppSettingOut)
async def get_auto_switch_setting(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the 'Auto-switch when a model disappears' setting status."""
    from app.models.council import CouncilAppSetting

    st = db.query(CouncilAppSetting).filter(CouncilAppSetting.setting_key == "auto_switch_on_missing_model").first()
    if not st:
        st = CouncilAppSetting(
            setting_key="auto_switch_on_missing_model",
            setting_value=True,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(st)
        db.commit()
        db.refresh(st)
    return st


@router.put("/settings/auto-switch", response_model=CouncilAppSettingOut, dependencies=[Depends(verify_csrf)])
async def update_auto_switch_setting(
    payload: AutoSwitchSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggles 'Auto-switch when a model disappears' setting."""
    from app.models.council import CouncilAppSetting

    st = db.query(CouncilAppSetting).filter(CouncilAppSetting.setting_key == "auto_switch_on_missing_model").first()
    if not st:
        st = CouncilAppSetting(
            setting_key="auto_switch_on_missing_model",
            setting_value=payload.enabled,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(st)
    else:
        st.setting_value = payload.enabled
        st.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(st)
    return st


@router.get("/switch-logs", response_model=List[ModelSwitchLogOut])
async def get_model_switch_logs(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns the audit log of auto-switched models with Revert capability."""
    from app.models.council import ModelSwitchLog

    logs = db.query(ModelSwitchLog).order_by(ModelSwitchLog.switched_at.desc()).limit(limit).all()
    return logs


@router.post("/switch-logs/{log_id}/revert", dependencies=[Depends(verify_csrf)])
async def revert_model_switch_log(
    log_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reverts an auto-switch action back to the previous model."""
    from app.models.council import ModelSwitchLog, ProviderSetting
    from app.services.council.adapters_factory import derive_model_family

    log_entry = db.query(ModelSwitchLog).filter(ModelSwitchLog.id == log_id).first()
    if not log_entry:
        raise HTTPException(status_code=404, detail="Switch log entry not found.")

    p_key = log_entry.provider_key
    target_mid = log_entry.old_model_id

    setting = db.query(ProviderSetting).filter(ProviderSetting.provider_key == p_key).first()
    if setting:
        setting.model_id = target_mid
        setting.family_override = derive_model_family(target_mid, p_key)
        setting.updated_at = datetime.now(timezone.utc)

    log_entry.reverted = True
    db.commit()
    return {"status": "ok", "provider_key": p_key, "reverted_to": target_mid, "restored_model_id": target_mid}




@router.post("/test-connection", response_model=TestConnectionResponse, dependencies=[Depends(verify_csrf)])
@limiter.limit("20/minute")
async def test_council_provider_connection(
    request: Request,
    payload: TestConnectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Tests a configured AI Council provider connection:
    - Sends a tiny fixed prompt without financial data
    - Measures roundtrip latency in ms
    - Verifies HTTP status and diagnoses errors (invalid key, model not found, rate limited, timeout, bad JSON)
    - Queries the provider's /models catalog and verifies if model_id is found, offering close matches if not.
    - Rate limited to 20 tests/minute.
    - Requires Authentication & CSRF. Never returns or logs API keys.
    """
    res = await verify_provider_connectivity(
        provider_name=payload.provider_name,
        model_id=payload.model_id,
        user_settings=current_user.settings or {},
        db=db,
    )
    return res


@router.post("/preview")
async def preview_council_prompt(
    request: AskCouncilRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates and returns the exact server-scrubbed prompt that will be sent to the AIs.
    Demonstrates zero PII leakage and pre-computed deterministic financial ratios.
    """
    user_settings = current_user.settings or {}
    max_dti = float(user_settings.get("max_dti_ratio", settings.DEFAULT_MAX_DTI_RATIO))
    min_runway = float(user_settings.get("min_runway_months", settings.DEFAULT_MIN_RUNWAY_MONTHS))

    snapshot = calculate_user_financial_snapshot(
        db=db,
        user_id=current_user.id,
        candidate_amount=request.candidate_amount,
        decision_type=request.decision_type,
        max_dti_threshold=max_dti,
        min_runway_threshold=min_runway,
    )

    sanitized_question = scrub_pii_from_text(request.question)
    anonymized_context = build_anonymized_council_context(snapshot, current_user.currency)

    prompt = (
        f"{anonymized_context}\n\n"
        f"USER DECISION / INQUIRY:\n\"{sanitized_question}\"\n"
        f"DECISION TYPE: {request.decision_type.upper()}\n"
    )
    if request.candidate_amount:
        prompt += f"PROPOSED AMOUNT: {current_user.currency} {float(request.candidate_amount):,.2f}\n\n"
    prompt += "Please independently evaluate this decision and return your strict JSON vote."

    return {
        "sanitized_question": sanitized_question,
        "anonymized_prompt": prompt,
        "financial_snapshot": snapshot,
    }


@router.post("/ask", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
@limiter.limit("5/minute")
async def ask_council(
    request: Request,
    payload: AskCouncilRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a financial question for multi-AI Council deliberation as a background job.
    Returns immediately with a job ID and initial status for frontend polling and persistence.
    """
    job = create_deliberation_job(db=db, user=current_user, request=payload, background_tasks=background_tasks)
    return job


@router.get("/jobs/{job_id}", response_model=CouncilJobStatus)
async def get_council_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the real-time progress or completed decision of a Council deliberation job.
    Supports persistent retrieval if mobile device slept or browser tab was closed.
    """
    status_info = get_deliberation_job_status(db=db, user_id=current_user.id, job_id=job_id)
    if not status_info:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council deliberation job not found.")
    return status_info


@router.get("/history", response_model=List[CouncilDecisionOut])
async def list_council_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieves previous council deliberations and recorded decisions for current user."""
    decisions = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.user_id == current_user.id)
        .order_by(CouncilDecision.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return decisions


@router.get("/decision/{decision_id}", response_model=CouncilDecisionOut)
async def get_council_decision(
    decision_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single council deliberation details with user isolation."""
    decision = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.id == decision_id, CouncilDecision.user_id == current_user.id)
        .first()
    )
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council decision not found.")
    return decision


@router.post("/decide/{decision_id}", response_model=CouncilDecisionOut, dependencies=[Depends(verify_csrf)])
async def record_user_decision(
    decision_id: str,
    payload: UserDecisionSubmit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Record the user's final say: Accept, Reject, or Modify the Council's verdict.
    """
    decision = (
        db.query(CouncilDecision)
        .filter(CouncilDecision.id == decision_id, CouncilDecision.user_id == current_user.id)
        .first()
    )
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Council decision not found.")

    decision.user_verdict = payload.user_verdict
    decision.user_modifications = payload.user_modifications
    decision.decided_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(decision)
    return decision


@router.post("/decision/{decision_id}/retry-failed", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
@limiter.limit("5/minute")
async def retry_failed_council_providers(
    request: Request,
    decision_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Re-queries only the failed, timed-out, or unavailable AI providers for an existing deliberation
    as an asynchronous background job.
    Enforces 1 active job per user, ownership check (404), rate limit, records quota usage,
    and returns CouncilJobStatus for client polling.
    """
    job_status = create_retry_job(
        db=db,
        user=current_user,
        decision_id=decision_id,
        background_tasks=background_tasks,
    )
    return job_status


@router.post("/jobs/{job_id}/cancel", response_model=CouncilJobStatus, dependencies=[Depends(verify_csrf)])
async def cancel_council_deliberation_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Cancels an active or pending council deliberation job and frees the user's active job slot.
    Requires authentication, CSRF, and user ownership check.
    """
    return cancel_deliberation_job(db=db, user_id=current_user.id, job_id=job_id)


@router.post("/providers/{provider_name}/reset-circuit-breaker", dependencies=[Depends(verify_csrf)])
async def reset_provider_circuit_breaker(
    provider_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Manually resets a tripped circuit breaker for a provider ('Retry now' action).
    Requires authentication and CSRF.
    """
    reset_circuit_breaker(db, provider_name)
    return {
        "status": "ok",
        "provider_name": provider_name,
        "message": f"Circuit breaker for provider '{provider_name}' has been reset.",
    }

