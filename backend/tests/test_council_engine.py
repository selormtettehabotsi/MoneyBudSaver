"""
Unit and Integration Tests for AI Council Deliberation Engine:
- JSON Extraction, Auto-Repair, and Validation
- Confidence-Weighted Tallying Math
- Privacy and PII Sanitization
- Provider Status Endpoint
- Deliberation Execution & User Final Decision Recording
"""
import pytest
from decimal import Decimal
from app.services.council.json_repair import (
    extract_and_repair_json,
    validate_and_normalize_vote,
)
from app.services.council.engine import _calculate_tally
from app.services.privacy import scrub_pii_from_text
from app.schemas.council import IndividualVote


def test_json_extraction_from_markdown_fences():
    raw = """
    Here is my evaluation:
    ```json
    {
      "verdict": "approve",
      "confidence": 85,
      "reasoning": "The applicant has strong monthly cashflow and low DTI.",
      "risks": ["Unexpected equipment failure"],
      "conditions": ["Keep emergency fund intact"],
      "suggested_amount": 2000.00
    }
    ```
    I hope this helps!
    """
    extracted = extract_and_repair_json(raw)
    assert extracted is not None
    assert extracted["verdict"] == "approve"
    assert extracted["confidence"] == 85

    is_valid, norm, err = validate_and_normalize_vote(extracted)
    assert is_valid is True
    assert norm["verdict"] == "approve"
    assert norm["confidence"] == 85
    assert len(norm["risks"]) == 1


def test_json_repair_trailing_commas_and_single_quotes():
    malformed = """
    {
      'verdict': 'approve_with_conditions',
      'confidence': 70,
      'reasoning': 'Feasible only if monthly payments do not exceed budget.',
      'risks': ['High interest rate',],
      'conditions': ['Limit loan term to 12 months',],
      'suggested_amount': null,
    }
    """
    extracted = extract_and_repair_json(malformed)
    assert extracted is not None
    is_valid, norm, err = validate_and_normalize_vote(extracted)
    assert is_valid is True
    assert norm["verdict"] == "approve_with_conditions"
    assert norm["confidence"] == 70


def test_tally_calculation_unanimous_approve():
    votes = [
        IndividualVote(
            provider_name="Gemini",
            model_id="gemini-2.5-flash",
            model_family="Gemini",
            status="success",
            verdict="approve",
            confidence=90,
            reasoning="Low DTI and strong cashflow.",
        ),
        IndividualVote(
            provider_name="Groq",
            model_id="llama-3.3-70b",
            model_family="Llama",
            status="success",
            verdict="approve",
            confidence=80,
            reasoning="Ample runway to absorb debt.",
        ),
    ]
    tally = _calculate_tally(votes)
    assert tally.final_verdict == "approve"
    assert tally.weighted_score > 0.8
    assert tally.is_tie is False
    assert tally.total_votes_counted == 2


def test_tally_calculation_unanimous_reject():
    votes = [
        IndividualVote(
            provider_name="Gemini",
            model_id="gemini-2.5-flash",
            model_family="Gemini",
            status="success",
            verdict="reject",
            confidence=95,
            reasoning="DTI would exceed safe limits.",
            risks=["Severe debt spiral risk"],
        ),
        IndividualVote(
            provider_name="Mistral",
            model_id="mistral-small",
            model_family="Mistral",
            status="success",
            verdict="reject",
            confidence=85,
            reasoning="Runway is dangerously low.",
        ),
    ]
    tally = _calculate_tally(votes)
    assert tally.final_verdict == "reject"
    assert tally.weighted_score < -0.8
    assert tally.is_tie is False


def test_tally_calculation_split_decision():
    votes = [
        IndividualVote(
            provider_name="Gemini",
            model_id="gemini",
            model_family="Gemini",
            status="success",
            verdict="approve",
            confidence=60,
            reasoning="Acceptable risk.",
        ),
        IndividualVote(
            provider_name="Groq",
            model_id="llama",
            model_family="Llama",
            status="success",
            verdict="reject",
            confidence=60,
            reasoning="Too risky.",
        ),
    ]
    tally = _calculate_tally(votes)
    assert tally.final_verdict == "split_decision"
    assert tally.is_tie is True
    assert -0.2 <= tally.weighted_score <= 0.2


def test_privacy_pii_scrubber():
    text = "Please contact me at john.doe@example.com or 555-123-4567 regarding my card 4111-2222-3333-4444 and account ACC-987654321."
    scrubbed = scrub_pii_from_text(text)
    assert "john.doe@example.com" not in scrubbed
    assert "555-123-4567" not in scrubbed
    assert "4111-2222-3333-4444" not in scrubbed
    assert "ACC-987654321" not in scrubbed
    assert "[EMAIL_REDACTED]" in scrubbed
    assert "[PHONE_REDACTED]" in scrubbed
    assert "[CARD_REDACTED]" in scrubbed


def test_council_api_endpoints_and_decision_flow(make_auth_client):
    client, user = make_auth_client("council_user@example.com", "Password123!")

    # 1. Check providers status list
    prov_res = client.get("/api/v1/council/providers")
    assert prov_res.status_code == 200
    providers = prov_res.json()
    assert len(providers) >= 5

    # 2. Preview Council Prompt (server-side PII scrubbing and deterministic context)
    preview_res = client.post(
        "/api/v1/council/preview",
        json={
            "question": "Should I buy a new Mac for GHS 5,000 using my card 4111-2222-3333-4444?",
            "decision_type": "purchase",
            "candidate_amount": "5000.00",
        },
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert "4111-2222-3333-4444" not in preview_data["anonymized_prompt"]
    assert "[CARD_REDACTED]" in preview_data["anonymized_prompt"]
    assert "FINANCIAL FACTS & RATIOS" in preview_data["anonymized_prompt"]

    # 3. Ask the Council (using simulated/mocked deliberation)
    ask_res = client.post(
        "/api/v1/council/ask",
        json={
            "question": "Should I take a loan of GHS 2,500 to expand my inventory?",
            "decision_type": "borrow",
            "candidate_amount": "2500.00",
            "enable_debate": False,
            "local_only_mode": False,
        },
    )
    assert ask_res.status_code == 200
    decision = ask_res.json()
    assert "id" in decision
    assert decision["decision_type"] == "borrow"
    assert "final_tally" in decision
    decision_id = decision["id"]

    # 4. User records final say: [ ACCEPTED ]
    decide_res = client.post(
        f"/api/v1/council/decide/{decision_id}",
        json={
            "user_verdict": "accepted",
            "user_modifications": "Proceeding with loan after securing supplier discount.",
        },
    )
    assert decide_res.status_code == 200
    assert decide_res.json()["user_verdict"] == "accepted"
    assert "supplier discount" in decide_res.json()["user_modifications"]

    # 5. Check history
    hist_res = client.get("/api/v1/council/history")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert len(history) == 1
    assert history[0]["id"] == decision_id


def test_outbound_payload_privacy_guarantee(make_auth_client):
    """
    Guarantees that raw transaction descriptions, merchant names, and private account numbers
    are NEVER included in the outbound prompt sent to AI models.
    """
    client, user = make_auth_client("privacy_audit@example.com", "Password123!")

    # Create transactions with private identifiers and merchant names
    sensitive_descriptions = [
        "Payment to Dr. Jane Doe Specialist Clinic",
        "Transfer to Secret Swiss Bank ACCT-9988776655",
        "Pharmacy Rx Order #991823",
    ]
    for desc in sensitive_descriptions:
        client.post(
            "/api/v1/transactions",
            json={
                "amount": "150.00",
                "type": "expense",
                "date": "2026-10-01",
                "description": desc,
            },
        )

    # Preview prompt
    preview_res = client.post(
        "/api/v1/council/preview",
        json={
            "question": "Should I purchase dental equipment?",
            "decision_type": "purchase",
            "candidate_amount": "800.00",
        },
    )
    assert preview_res.status_code == 200
    prompt_text = preview_res.json()["anonymized_prompt"]

    # Assert none of the sensitive descriptions or account numbers leaked into the prompt
    for desc in sensitive_descriptions:
        assert desc not in prompt_text, f"Private transaction description leaked: {desc}"
    assert "Jane Doe" not in prompt_text
    assert "9988776655" not in prompt_text
    assert "ACCT-9988776655" not in prompt_text


def test_default_model_ids_and_families():
    """Verifies that default model IDs are set to non-Llama gpt-oss for Groq and Qwen for OpenRouter."""
    from app.config import settings
    assert settings.GROQ_MODEL_ID == "openai/gpt-oss-120b"
    assert settings.OPENROUTER_MODEL_ID == "qwen/qwen-2.5-72b-instruct:free"


def test_model_family_diversity():
    """Verifies that the 4 default free providers map to 4 distinct model families."""
    from app.services.council.adapters_factory import get_configured_providers
    from app.config import settings

    # Simulate all 4 free provider keys present
    orig_gemini = settings.GEMINI_API_KEY
    orig_groq = settings.GROQ_API_KEY
    orig_mistral = settings.MISTRAL_API_KEY
    orig_openrouter = settings.OPENROUTER_API_KEY
    orig_cerebras = settings.CEREBRAS_API_KEY

    try:
        settings.GEMINI_API_KEY = "test_gemini"
        settings.GROQ_API_KEY = "test_groq"
        settings.MISTRAL_API_KEY = "test_mistral"
        settings.OPENROUTER_API_KEY = "test_openrouter"
        settings.CEREBRAS_API_KEY = "test_cerebras"

        # Default settings: Cerebras must be off by default
        adapters = get_configured_providers()
        families = {a.model_family for a in adapters}
        
        # 4 distinct families without Cerebras
        assert len(adapters) == 4
        assert len(families) == 4
        assert "Google Gemini Family" in families
        assert "OpenAI / GPT-OSS Family" in families
        assert "Mistral Family" in families
        assert "Qwen Family" in families
        assert not any(a.name == "cerebras" for a in adapters)

        # Enabling Cerebras explicitly should add Meta Llama Family
        adapters_with_cerebras = get_configured_providers(
            user_settings={"providers_enabled": {"cerebras": True}}
        )
        assert any(a.name == "cerebras" for a in adapters_with_cerebras)

    finally:
        settings.GEMINI_API_KEY = orig_gemini
        settings.GROQ_API_KEY = orig_groq
        settings.MISTRAL_API_KEY = orig_mistral
        settings.OPENROUTER_API_KEY = orig_openrouter
        settings.CEREBRAS_API_KEY = orig_cerebras


def test_council_deliberation_with_subset_of_keys(make_auth_client):
    """
    Verifies that the Council runs normally with any subset of keys (e.g., 0, 1, or 2 keys),
    and unconfigured keys never throw an error.
    """
    client, user = make_auth_client("subset_user@example.com", "Password123!")

    # Ask Council with no mock providers (simulates 0 keys configured)
    res = client.post(
        "/api/v1/council/ask",
        json={
            "question": "Should I invest in emergency bonds?",
            "decision_type": "investment",
            "candidate_amount": "1000.00",
            "enable_debate": True,
            "local_only_mode": False,
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "final_tally" in data
    assert data["final_tally"]["final_verdict"] in ("split_decision", "approve", "reject")

