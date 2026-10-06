"""
Strict JSON Schema Parser, Auto-Repair & Fallback Handler for AI Member Votes.
"""
import ast
import json
import re
from decimal import Decimal
from typing import Optional, Dict, Any, Tuple


STRICT_VOTE_SCHEMA_PROMPT = """
You MUST respond with a SINGLE RAW JSON OBJECT matching this EXACT schema (no markdown, no backticks, no text before or after):
{
  "verdict": "approve" | "reject" | "approve_with_conditions",
  "confidence": <integer from 0 to 100>,
  "reasoning": "<clear explanation of your financial reasoning>",
  "risks": ["<key risk 1>", "<key risk 2>"],
  "conditions": ["<mandatory condition 1>", "<condition 2 if applicable>"],
  "suggested_amount": <number or null>
}
"""


def extract_and_repair_json(raw_text: str) -> Optional[Dict[str, Any]]:
    """
    Extracts, cleans, and repairs JSON objects from LLM text responses,
    including reasoning models (e.g., GLM, DeepSeek, Kimi) that output <think>...</think> blocks.
    """
    if not raw_text:
        return None

    cleaned = raw_text.strip()

    # 1. Strip reasoning blocks: <think>...</think> or <thought>...</thought>
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"<thought>[\s\S]*?</thought>", "", cleaned, flags=re.IGNORECASE)
    # If unclosed <think> tag remains before the JSON
    if "<think>" in cleaned.lower() and "{" in cleaned:
        first_brace = cleaned.find("{")
        cleaned = cleaned[first_brace:]
    
    cleaned = cleaned.strip()

    # 2. Strip markdown code fences if present
    if "```" in cleaned:
        # Match ```json ... ``` or ``` ... ```
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
        if match:
            cleaned = match.group(1).strip()

    # 3. If text contains surrounding content, locate first '{' and last '}'
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx : end_idx + 1]

    # 4. Direct parse attempt
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # 4. Try ast.literal_eval fallback with Python keyword replacements
    try:
        py_str = re.sub(r"\bnull\b", "None", cleaned, flags=re.IGNORECASE)
        py_str = re.sub(r"\btrue\b", "True", py_str, flags=re.IGNORECASE)
        py_str = re.sub(r"\bfalse\b", "False", py_str, flags=re.IGNORECASE)
        data = ast.literal_eval(py_str)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # 5. Repair common LLM syntax issues (trailing commas, single quotes)
    repaired = re.sub(r",\s*([\]}])", r"\1", cleaned)  # remove trailing commas
    repaired = re.sub(r"'([^']+)'\s*:", r'"\1":', repaired)  # single quotes to double on keys
    repaired = re.sub(r"':\s*'([^']*)'", r'": "\1"', repaired)
    repaired = re.sub(r":\s*'([^']*)'", r': "\1"', repaired)  # single quotes to double on values
    repaired = re.sub(r"\[\s*'([^']*)'", r'["\1"', repaired)
    repaired = re.sub(r",\s*'([^']*)'", r', "\1"', repaired)

    try:
        data = json.loads(repaired)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    return None


def validate_and_normalize_vote(
    parsed_json: Optional[Dict[str, Any]]
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """
    Validates that parsed JSON strictly conforms to the IndividualVote schema.
    Normalizes verdicts, types, bounds, and lists.
    Returns (is_valid, normalized_dict, error_message).
    """
    if not parsed_json:
        return False, {}, "Failed to parse valid JSON from model response."

    # Validate verdict
    verdict_raw = str(parsed_json.get("verdict", "")).lower().strip().replace(" ", "_").replace("-", "_")
    if "condition" in verdict_raw:
        verdict = "approve_with_conditions"
    elif "approve" in verdict_raw:
        verdict = "approve"
    elif "reject" in verdict_raw:
        verdict = "reject"
    else:
        return False, {}, f"Invalid verdict value '{verdict_raw}'. Must be approve, reject, or approve_with_conditions."

    # Validate confidence
    try:
        confidence = int(float(parsed_json.get("confidence", 50)))
        confidence = max(0, min(100, confidence))
    except (ValueError, TypeError):
        confidence = 50

    # Validate reasoning
    reasoning = str(parsed_json.get("reasoning", "")).strip()
    if not reasoning:
        reasoning = "Model provided a vote with no explanatory text."

    # Validate risks
    risks_raw = parsed_json.get("risks", [])
    if isinstance(risks_raw, list):
        risks = [str(r).strip() for r in risks_raw if str(r).strip()]
    elif isinstance(risks_raw, str) and risks_raw.strip():
        risks = [risks_raw.strip()]
    else:
        risks = []

    # Validate conditions
    conditions_raw = parsed_json.get("conditions", [])
    if isinstance(conditions_raw, list):
        conditions = [str(c).strip() for c in conditions_raw if str(c).strip()]
    elif isinstance(conditions_raw, str) and conditions_raw.strip():
        conditions = [conditions_raw.strip()]
    else:
        conditions = []

    # Validate suggested amount
    suggested_amount_raw = parsed_json.get("suggested_amount")
    suggested_amount = None
    if suggested_amount_raw is not None and suggested_amount_raw != "" and suggested_amount_raw != "null":
        try:
            val = float(suggested_amount_raw)
            if val > 0:
                suggested_amount = Decimal(str(val))
        except (ValueError, TypeError):
            suggested_amount = None

    normalized = {
        "verdict": verdict,
        "confidence": confidence,
        "reasoning": reasoning,
        "risks": risks,
        "conditions": conditions,
        "suggested_amount": suggested_amount,
    }

    return True, normalized, None
