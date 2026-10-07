"""
Pattern resolution service for AI Council recommended models.
Resolves pattern-based seeds (e.g. 'gemini-*-flash', 'openai/gpt-oss-120b', 'qwen*', '*nemotron*', '*gemma*', '*')
against live provider catalogs at runtime, prioritizing newest release and largest parameter size.
"""
import fnmatch
import json
import os
import re
from typing import List, Dict, Any, Optional, Set, Tuple
from sqlalchemy.orm import Session

from app.models.council import RecommendedModel
from app.services.council.adapters_factory import derive_model_family


DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
RECOMMENDED_PATTERNS_FILE = os.path.join(DATA_DIR, "recommended_models.json")


def load_recommended_patterns_from_file() -> Dict[str, List[str]]:
    """Loads default provider patterns from recommended_models.json."""
    if os.path.exists(RECOMMENDED_PATTERNS_FILE):
        try:
            with open(RECOMMENDED_PATTERNS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "gemini": ["gemini-*-flash"],
        "groq": ["openai/gpt-oss-120b", "qwen*", "*"],
        "openrouter": ["*nemotron*", "*gemma*", "*"],
        "nvidia": [
            "meta/muse-glimmer-30b",
            "moonshotai/kimi-k3",
            "z-ai/glm-5.3",
            "z-ai/glm-5.3-flash",
        ],
    }


def normalize_provider_key(provider_name: str) -> str:
    """Normalizes provider slot keys (groq_1 -> groq, openrouter_2 -> openrouter, nvidia_kimi -> nvidia)."""
    p = provider_name.lower().strip()
    if p.startswith("groq"):
        return "groq"
    if p.startswith("openrouter"):
        return "openrouter"
    if p.startswith("nvidia"):
        return "nvidia"
    return p


def get_patterns_for_provider(provider_name: str, db: Optional[Session] = None) -> List[str]:
    """
    Retrieves the ordered pattern list for a provider.
    First checks database (RecommendedModel table), then falls back to recommended_models.json.
    """
    p_exact = provider_name.lower().strip()
    p_norm = normalize_provider_key(provider_name)

    if db is not None:
        try:
            # Check exact key first (e.g. groq_1)
            recs = db.query(RecommendedModel).filter(
                RecommendedModel.provider_name == p_exact
            ).order_by(RecommendedModel.sort_order.asc()).all()
            if recs:
                return [r.model_id for r in recs]

            # Check normalized key (e.g. groq)
            if p_norm != p_exact:
                recs_norm = db.query(RecommendedModel).filter(
                    RecommendedModel.provider_name == p_norm
                ).order_by(RecommendedModel.sort_order.asc()).all()
                if recs_norm:
                    return [r.model_id for r in recs_norm]
        except Exception:
            pass

    # File fallback
    file_patterns = load_recommended_patterns_from_file()
    if p_exact in file_patterns:
        return file_patterns[p_exact]
    if p_norm in file_patterns:
        return file_patterns[p_norm]

    return []


def extract_version_tuple(model_id: str) -> Tuple[int, ...]:
    """
    Extracts numerical version from model name (e.g. 'gemini-2.5-flash' -> (2, 5), 'llama-3.3' -> (3, 3), 'glm-5.3' -> (5, 3)).
    """
    m_lower = model_id.lower()
    # Match standard decimal versions like 2.5, 3.1, 5.3, 1.5
    matches = re.findall(r'(\d+)\.(\d+)(?:\.(\d+))?', m_lower)
    if matches:
        first = matches[0]
        return tuple(int(x) for x in first if x)

    # Match single digit versions like r1, k3, v3
    v_match = re.search(r'[rvk](\d+)', m_lower)
    if v_match:
        return (int(v_match.group(1)),)

    return (0,)


def extract_param_size(model_id: str) -> int:
    """
    Extracts parameter size in billions (e.g. '120b' -> 120, '70b' -> 70, '32b' -> 32).
    """
    m_lower = model_id.lower()
    b_match = re.search(r'(\d+)b\b', m_lower)
    if b_match:
        try:
            return int(b_match.group(1))
        except ValueError:
            return 0
    return 0


def is_model_excluded_for_provider(model_id: str, provider_name: str) -> bool:
    """
    Applies strict provider-specific exclusion filters.
    Gemini: excludes lite, tts, image, embed.
    """
    m_lower = model_id.lower().strip()
    p_norm = normalize_provider_key(provider_name)

    # General chat capability exclusions
    if any(k in m_lower for k in ("embed", "embedding", "whisper", "tts", "speech", "audio", "dall-e", "imagen", "flux", "stable-diffusion", "guard", "moderation", "rerank")):
        return True

    # Gemini-specific exclusions: gemini-*-flash (not lite, not tts, not image)
    if p_norm == "gemini":
        if any(k in m_lower for k in ("lite", "tts", "image", "audio", "embed")):
            return True

    return False


def model_sort_key(
    model_id: str,
    provider_name: str = "",
    other_active_families: Optional[Set[str]] = None,
) -> Tuple[int, Tuple[int, ...], int, int, int, str]:
    """
    Generates a sort key to rank candidates newest and largest first.
    Tuple components (higher is better):
    1. Diversity bonus (1 if family not already in other_active_families, 0 otherwise)
    2. Version tuple (e.g. (2, 5) > (2, 0) > (1, 5))
    3. Parameter size in billions (e.g. 120 > 72 > 70 > 32 > 8)
    4. Instruct / Chat / Flash indicator (1 if instruct/chat/flash, 0 otherwise)
    5. Non-preview indicator (1 if not preview/experimental, 0 if preview)
    6. Model ID (for deterministic tie-breaking)
    """
    m_lower = model_id.lower().strip()

    # 1. Family diversity bonus
    diversity_bonus = 0
    if other_active_families:
        fam = derive_model_family(model_id, provider_name)
        if fam and fam not in other_active_families:
            diversity_bonus = 1

    # 2. Version tuple
    version = extract_version_tuple(m_lower)

    # 3. Parameter size
    param_size = extract_param_size(m_lower)

    # 4. Instruct/Chat/Flash bonus
    instruct_bonus = 1 if any(k in m_lower for k in ("instruct", "chat", "flash", "versatile", "it")) else 0

    # 5. Non-preview bonus
    is_stable = 0 if any(k in m_lower for k in ("preview", "exp", "experimental", "test")) else 1

    return (diversity_bonus, version, param_size, instruct_bonus, is_stable, model_id)


def resolve_pattern_to_models(
    pattern: str,
    catalog: List[str],
    provider_name: str = "",
    is_free_map: Optional[Dict[str, bool]] = None,
    other_active_families: Optional[Set[str]] = None,
    excluded_ids: Optional[Set[str]] = None,
) -> List[str]:
    """
    Matches a single pattern against the catalog and returns all matching models sorted newest/largest first.
    """
    pat_clean = pattern.strip()
    p_norm = normalize_provider_key(provider_name)
    used = excluded_ids or set()

    matches: List[str] = []

    for mid in catalog:
        if mid in used:
            continue

        # Check provider exclusions (e.g. Gemini lite/tts/image)
        if is_model_excluded_for_provider(mid, provider_name):
            continue

        # OpenRouter free tier constraint
        if p_norm == "openrouter":
            if is_free_map is not None:
                if not is_free_map.get(mid, False) and ":free" not in mid.lower():
                    continue
            elif ":free" not in mid.lower():
                # If no free map provided, ensure :free suffix
                continue

        mid_lower = mid.lower().strip()
        pat_lower = pat_clean.lower().strip()

        # Wildcard pattern match
        if fnmatch.fnmatch(mid_lower, pat_lower):
            matches.append(mid)
        # Exact match or match without :free tag
        elif mid_lower == pat_lower or mid_lower.replace(":free", "") == pat_lower.replace(":free", ""):
            matches.append(mid)

    # Sort matching candidates newest/largest first
    return sorted(
        matches,
        key=lambda m: model_sort_key(m, provider_name=provider_name, other_active_families=other_active_families),
        reverse=True,
    )


def resolve_provider_recommended_patterns(
    provider_name: str,
    patterns: List[str],
    catalog_models: List[str],
    is_free_map: Optional[Dict[str, bool]] = None,
    other_active_families: Optional[Set[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Resolves an ordered list of patterns against a live catalog.
    Returns detailed resolution records for each pattern.
    """
    resolved_records: List[Dict[str, Any]] = []
    used_model_ids: Set[str] = set()

    for idx, pat in enumerate(patterns):
        matched = resolve_pattern_to_models(
            pattern=pat,
            catalog=catalog_models,
            provider_name=provider_name,
            is_free_map=is_free_map,
            other_active_families=other_active_families,
            excluded_ids=used_model_ids,
        )

        if matched:
            best_model = matched[0]
            used_model_ids.add(best_model)
            resolved_records.append({
                "provider_name": provider_name,
                "pattern": pat,
                "resolved_model_id": best_model,
                "model_id": best_model,
                "status": "matched",
                "in_live_catalog": True,
                "all_matches": matched,
                "sort_order": idx,
            })
        else:
            # Pattern could not be resolved against live catalog
            resolved_records.append({
                "provider_name": provider_name,
                "pattern": pat,
                "resolved_model_id": None,
                "model_id": pat,
                "status": "no match in catalog",
                "in_live_catalog": False,
                "all_matches": [],
                "sort_order": idx,
            })

    return resolved_records
