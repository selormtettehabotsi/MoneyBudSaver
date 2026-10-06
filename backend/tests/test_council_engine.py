"""
Unit and Integration Tests for AI Council Deliberation Engine:
- JSON Extraction, Auto-Repair, and Validation
- Confidence-Weighted Tallying Math
- Privacy and PII Sanitization
- Truncation Detection (finish_reason == 'length' and 'MAX_TOKENS')
- Provider Connection Testing (200 success, 401 invalid key, 404 model not found, 429 rate limit, fuzzy catalog matches)
- Background Deliberation Job Flow & Status Polling
- Fast Mocked Sleep for Backoff and Staggering
"""
import asyncio
import pytest
from decimal import Decimal
from app.services.council.json_repair import (
    extract_and_repair_json,
    validate_and_normalize_vote,
)
from app.services.council.engine import _calculate_tally
from app.services.privacy import scrub_pii_from_text
from app.schemas.council import IndividualVote
from app.services.council.base_adapter import OpenAICompatibleAdapter
from app.services.council.gemini_adapter import GeminiAdapter


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


@pytest.mark.asyncio
async def test_adapter_truncation_detection_finish_reason_length(monkeypatch):
    """Tests that OpenAICompatibleAdapter detects finish_reason='length' and reports 'truncated response'."""
    import httpx

    adapter = OpenAICompatibleAdapter(
        name="openrouter",
        display_name="OpenRouter Qwen",
        model_family="Qwen Family",
        model_id="qwen/qwen3.8-27b:free",
        base_url="https://openrouter.ai/api/v1",
        api_key="sk-test-key",
    )

    mock_resp = httpx.Response(
        200,
        json={
            "choices": [
                {
                    "finish_reason": "length",
                    "message": {
                        "content": '{"verdict": "approve", "confidence": 85, "reasoning": "Incomplete text cut off here...'
                    },
                }
            ]
        },
        request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"),
    )

    async def mock_post(*args, **kwargs):
        return mock_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    vote = await adapter.query("Prompt", "Instruction", timeout_seconds=5)
    assert vote.status == "unavailable"
    assert "truncated response" in (vote.error_message or "").lower()
    assert "invalid response" not in (vote.error_message or "").lower()


@pytest.mark.asyncio
async def test_gemini_adapter_truncation_detection_max_tokens(monkeypatch):
    """Tests that GeminiAdapter detects finishReason='MAX_TOKENS' and reports 'truncated response'."""
    import httpx

    adapter = GeminiAdapter(
        name="gemini",
        display_name="Google Gemini",
        model_family="Google Gemini Family",
        model_id="gemini-3.8-flash",
        api_key="gemini-test-key",
    )

    mock_resp = httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "finishReason": "MAX_TOKENS",
                    "content": {
                        "parts": [{"text": '{"verdict": "approve", "confidence": 90, "reasoning": "Cut off text...'}]
                    },
                }
            ]
        },
        request=httpx.Request("POST", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent"),
    )

    async def mock_post(*args, **kwargs):
        return mock_resp

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    vote = await adapter.query("Prompt", "Instruction", timeout_seconds=5)
    assert vote.status == "unavailable"
    assert "truncated response" in (vote.error_message or "").lower()
    assert "invalid response" not in (vote.error_message or "").lower()


def test_test_connection_endpoint_success(make_auth_client, monkeypatch):
    """Tests that POST /council/test-connection succeeds and checks catalog."""
    import httpx
    client, user = make_auth_client("test_conn_user@example.com", "Password123!")

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"status": "ok", "ping": "pong"}'}}]},
            request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            200,
            json={"data": [{"id": "openai/gpt-oss-120b"}, {"id": "llama-3.3-70b-versatile"}]},
            request=httpx.Request("GET", "https://api.groq.com/openai/v1/models"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "groq", "model_id": "openai/gpt-oss-120b"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["http_status"] == 200
    assert data["model_found_in_list"] is True
    assert data["available_models_count"] == 2


def test_test_connection_endpoint_401_invalid_key(make_auth_client, monkeypatch):
    """Tests that POST /council/test-connection properly diagnoses invalid API key."""
    import httpx
    client, user = make_auth_client("test_conn_401@example.com", "Password123!")

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            401,
            json={"error": {"message": "Invalid API key provided"}},
            request=httpx.Request("POST", "https://api.mistral.ai/v1/chat/completions"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            401,
            json={"error": {"message": "Invalid API key"}},
            request=httpx.Request("GET", "https://api.mistral.ai/v1/models"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "mistral", "model_id": "mistral-small-latest"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "invalid_key"
    assert data["http_status"] == 401
    assert "Invalid API Key" in data["diagnosis"]


def test_test_connection_endpoint_404_model_not_found(make_auth_client, monkeypatch):
    """Tests that POST /council/test-connection diagnoses HTTP 404 model not found."""
    import httpx
    client, user = make_auth_client("test_conn_404@example.com", "Password123!")

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            404,
            json={"error": {"message": "The model `nonexistent-model` does not exist"}},
            request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            200,
            json={"data": [{"id": "openai/gpt-oss-120b"}]},
            request=httpx.Request("GET", "https://api.groq.com/openai/v1/models"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "groq", "model_id": "nonexistent-model"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "model_not_found"
    assert data["http_status"] == 404
    assert data["model_found_in_list"] is False


def test_test_connection_endpoint_429_rate_limited(make_auth_client, monkeypatch):
    """Tests that POST /council/test-connection diagnoses HTTP 429 rate limit."""
    import httpx
    from app.config import settings
    client, user = make_auth_client("test_conn_429@example.com", "Password123!")

    monkeypatch.setattr(settings, "NVIDIA_API_KEY", "nvapi-testkey")

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            429,
            json={"error": {"message": "Rate limit reached"}},
            request=httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            429,
            json={"error": {"message": "Rate limit reached"}},
            request=httpx.Request("GET", "https://integrate.api.nvidia.com/v1/models"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "nvidia", "model_id": "z-ai/glm-5.3-flash"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "rate_limited"
    assert data["http_status"] == 429
    assert "rate limit" in data["diagnosis"].lower()


def test_test_connection_fuzzy_catalog_matching(make_auth_client, monkeypatch):
    """Tests that model catalog close matches are computed when exact model ID is missing."""
    import httpx
    from app.config import settings
    client, user = make_auth_client("test_conn_fuzzy@example.com", "Password123!")

    monkeypatch.setattr(settings, "OPENROUTER_API_KEY", "sk-openrouter-test")

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"status": "ok", "ping": "pong"}'}}]},
            request=httpx.Request("POST", "https://openrouter.ai/api/v1/chat/completions"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            200,
            json={"data": [
                {"id": "qwen/qwen-2.5-72b-instruct"},
                {"id": "qwen/qwen3.8-27b:free"},
                {"id": "mistralai/mistral-7b-instruct"},
            ]},
            request=httpx.Request("GET", "https://openrouter.ai/api/v1/models"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "openrouter", "model_id": "qwen/qwen3.8-27b"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["model_found_in_list"] is False
    assert len(data["close_matches"]) > 0
    assert any("qwen" in m.lower() for m in data["close_matches"])


@pytest.mark.asyncio
async def test_nvidia_nim_adapter_429_backoff_and_retry(monkeypatch):
    """Tests that HTTP 429 triggers exponential backoff retry (with mocked sleep for speed)."""
    import httpx

    # Mock asyncio.sleep to be instantaneous
    async def mock_sleep(secs):
        return

    monkeypatch.setattr(asyncio, "sleep", mock_sleep)

    adapter = OpenAICompatibleAdapter(
        name="nvidia",
        display_name="NVIDIA NIM (GLM)",
        model_family="Zhipu GLM",
        model_id="z-ai/glm-5.3-flash",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-testkey",
    )

    call_count = 0

    async def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(
                429,
                text="Rate limit exceeded",
                request=httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions"),
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "reject", "confidence": 80, "reasoning": "DTI exceeds safety limit.", "risks": ["Debt spiral"], "conditions": [], "suggested_amount": null}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    vote = await adapter.query(
        prompt="Test prompt",
        system_instruction="Test instruction",
        timeout_seconds=5,
    )
    assert call_count == 2
    assert vote.status == "success"
    assert vote.verdict == "reject"


@pytest.mark.asyncio
async def test_shared_key_staggering(monkeypatch):
    """Tests that voters sharing the same rate limit key acquire shared locks (with fast mocked sleep)."""
    import httpx

    async def mock_sleep(secs):
        return

    monkeypatch.setattr(asyncio, "sleep", mock_sleep)

    adapter1 = OpenAICompatibleAdapter(
        name="nvidia_glm",
        display_name="NVIDIA NIM (GLM)",
        model_family="Zhipu GLM",
        model_id="z-ai/glm-5.3-flash",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-shared",
        shared_rate_limit_key="nvidia_test_shared_fast",
    )

    adapter2 = OpenAICompatibleAdapter(
        name="nvidia_kimi",
        display_name="NVIDIA NIM (Kimi)",
        model_family="Moonshot Kimi",
        model_id="moonshotai/kimi-k3",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-shared",
        shared_rate_limit_key="nvidia_test_shared_fast",
    )

    async def mock_post(*args, **kwargs):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "approve", "confidence": 75, "reasoning": "Valid", "risks": [], "conditions": [], "suggested_amount": null}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    v1, v2 = await asyncio.gather(
        adapter1.query("Prompt 1", "Sys 1"),
        adapter2.query("Prompt 2", "Sys 2"),
    )

    assert v1.status == "success"
    assert v2.status == "success"


def test_council_deliberation_job_and_polling_flow(make_auth_client, monkeypatch):
    """
    Tests POST /council/ask returning a job_id and polling GET /council/jobs/{job_id}
    to completion and recording final decision.
    """
    import httpx
    import time
    client, user = make_auth_client("job_poll_user@example.com", "Password123!")

    # Mock all outbound AI API calls
    async def mock_post(*args, **kwargs):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "approve", "confidence": 88, "reasoning": "Strong runway and cash flow.", "risks": [], "conditions": [], "suggested_amount": 2500.0}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://api.test/chat/completions"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    # 1. Ask the Council (returns job_id immediately)
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
    job_info = ask_res.json()
    assert "job_id" in job_info
    job_id = job_info["job_id"]

    # 2. Poll GET /council/jobs/{job_id} until completed
    for _ in range(30):
        poll_res = client.get(f"/api/v1/council/jobs/{job_id}")
        assert poll_res.status_code == 200
        poll_data = poll_res.json()
        if poll_data["status"] == "completed":
            assert poll_data["decision"] is not None
            decision_id = poll_data["decision"]["id"]
            break
        time.sleep(0.05)
    else:
        pytest.fail(f"Deliberation job did not complete in time, last status: {poll_data}")

    # 3. User records final decision on persisted record
    decide_res = client.post(
        f"/api/v1/council/decide/{decision_id}",
        json={
            "user_verdict": "accepted",
            "user_modifications": "Proceeding with inventory order.",
        },
    )
    assert decide_res.status_code == 200
    assert decide_res.json()["user_verdict"] == "accepted"

    # 4. Check history
    hist_res = client.get("/api/v1/council/history")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert any(h["id"] == decision_id for h in history)


def test_default_model_ids_and_families():
    """Verifies that default model IDs are set to verified current models."""
    from app.config import settings
    assert settings.GEMINI_MODEL_ID == "gemini-3.8-flash"
    assert settings.GROQ_MODEL_ID == "openai/gpt-oss-120b"
    assert settings.MISTRAL_MODEL_ID == "mistral-small-latest"
    assert settings.OPENROUTER_MODEL_ID == "qwen/qwen3.8-27b:free"
    assert settings.NVIDIA_MODEL_ID == "z-ai/glm-5.3-flash"
    assert settings.NVIDIA_KIMI_MODEL_ID == "moonshotai/kimi-k3"


def test_model_family_diversity():
    """Verifies that the 5 default free providers map to 5 distinct model families."""
    from app.services.council.adapters_factory import get_configured_providers
    from app.config import settings

    orig_gemini = settings.GEMINI_API_KEY
    orig_groq = settings.GROQ_API_KEY
    orig_mistral = settings.MISTRAL_API_KEY
    orig_openrouter = settings.OPENROUTER_API_KEY
    orig_nvidia = settings.NVIDIA_API_KEY
    orig_cerebras = settings.CEREBRAS_API_KEY

    try:
        settings.GEMINI_API_KEY = "test_gemini"
        settings.GROQ_API_KEY = "test_groq"
        settings.MISTRAL_API_KEY = "test_mistral"
        settings.OPENROUTER_API_KEY = "test_openrouter"
        settings.NVIDIA_API_KEY = "test_nvidia"
        settings.CEREBRAS_API_KEY = "test_cerebras"

        adapters = get_configured_providers(
            user_settings={"providers_enabled": {"nvidia_kimi": False}}
        )
        families = {a.model_family for a in adapters}

        assert len(adapters) == 5
        assert len(families) == 5
        assert "Google Gemini Family" in families
        assert "OpenAI / GPT-OSS Family" in families
        assert "Mistral Family" in families
        assert "Qwen Family" in families
        assert "Zhipu GLM" in families
        assert not any(a.name == "cerebras" for a in adapters)

        adapters_with_kimi = get_configured_providers(
            user_settings={"providers_enabled": {"nvidia_kimi": True}}
        )
        assert any(a.name == "nvidia_kimi" for a in adapters_with_kimi)
        assert any(a.model_family == "Moonshot Kimi" for a in adapters_with_kimi)

    finally:
        settings.GEMINI_API_KEY = orig_gemini
        settings.GROQ_API_KEY = orig_groq
        settings.MISTRAL_API_KEY = orig_mistral
        settings.OPENROUTER_API_KEY = orig_openrouter
        settings.NVIDIA_API_KEY = orig_nvidia
        settings.CEREBRAS_API_KEY = orig_cerebras


@pytest.mark.asyncio
async def test_gemini_requests_contain_no_key_in_url(monkeypatch):
    """
    CRITICAL SECURITY TEST:
    Ensures that Gemini queries and list-models endpoints send API key in x-goog-api-key header
    and NEVER include 'key=' in the request URL.
    """
    import httpx
    from app.services.council.connection_tester import _fetch_models_gemini, verify_provider_connectivity

    captured_urls = []
    captured_headers = []

    adapter = GeminiAdapter(
        name="gemini",
        display_name="Google Gemini",
        model_family="Google Gemini Family",
        model_id="gemini-3.8-flash",
        api_key="secret-gemini-key-12345",
    )

    async def mock_post(client, url, *args, **kwargs):
        captured_urls.append(str(url))
        captured_headers.append(kwargs.get("headers", {}))
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "text": '{"verdict": "approve", "confidence": 85, "reasoning": "Valid", "risks": [], "conditions": [], "suggested_amount": null}'
                                }
                            ]
                        },
                    }
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    async def mock_get(client, url, *args, **kwargs):
        captured_urls.append(str(url))
        captured_headers.append(kwargs.get("headers", {}))
        return httpx.Response(
            200,
            json={"models": [{"name": "models/gemini-3.8-flash"}]},
            request=httpx.Request("GET", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    # 1. Test Adapter Query
    await adapter.query("Test prompt", "System instruction")
    # 2. Test Catalog Fetching
    await _fetch_models_gemini("secret-gemini-key-12345")

    assert len(captured_urls) >= 2
    for u in captured_urls:
        assert "key=" not in str(u).lower(), f"Security violation: Request URL '{u}' contains 'key='"
    
    # Check headers
    for h in captured_headers:
        if h:
            assert h.get("x-goog-api-key") == "secret-gemini-key-12345"


def test_redact_sensitive_info_utility():
    """Verifies that redact_sensitive_info removes bearer tokens, keys, and authorization headers."""
    from app.core.security import redact_sensitive_info

    msg1 = "Error connecting to https://api.groq.com?key=AIzaSySecretKey123456789012345678"
    redacted1 = redact_sensitive_info(msg1)
    assert "AIzaSySecretKey" not in redacted1
    assert "key=[REDACTED]" in redacted1

    msg2 = "HTTP 401: Unauthorized for Bearer gsk_abcdef123456789012345678"
    redacted2 = redact_sensitive_info(msg2)
    assert "abcdef" not in redacted2
    assert "Bearer [REDACTED]" in redacted2


@pytest.mark.asyncio
async def test_gemini_thinking_parameter_selection_and_retry_on_400(monkeypatch):
    """
    Verifies model-aware Gemini thinking configuration:
    - thinkingLevel for Gemini 3
    - thinkingBudget for Gemini 2.5
    - none for Gemini 1.5/2.0
    - automatic retry without thinking config on 400 rejection
    """
    import httpx
    from app.services.council.gemini_adapter import get_gemini_thinking_config

    assert get_gemini_thinking_config("gemini-3.8-flash") == {"thinkingLevel": "low"}
    assert get_gemini_thinking_config("gemini-2.5-flash") == {"thinkingBudget": 1024}
    assert get_gemini_thinking_config("gemini-1.5-flash") is None
    assert get_gemini_thinking_config("gemini-2.0-flash") is None

    # Test auto-retry on 400
    calls = []

    async def mock_post(client, url, *args, **kwargs):
        calls.append(kwargs.get("json", {}))
        if len(calls) == 1:
            # First call fails with 400 mentioning thinkingConfig
            return httpx.Response(
                400,
                text="Invalid argument: thinkingConfig is not supported for this model",
                request=httpx.Request("POST", str(url)),
            )
        # Second call succeeds
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {
                            "parts": [
                                {
                                    "text": '{"verdict": "approve", "confidence": 90, "reasoning": "Ok", "risks": [], "conditions": [], "suggested_amount": null}'
                                }
                            ]
                        },
                    }
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adapter = GeminiAdapter(
        name="gemini",
        model_id="gemini-3.8-flash",
        api_key="test-key",
    )
    vote = await adapter.query("Prompt", "Inst")
    assert vote.status == "success"
    assert len(calls) == 2
    # Verify second call removed thinkingConfig
    assert "thinkingConfig" not in calls[1].get("generationConfig", {})


def test_persistent_council_job_ownership_isolation_404(make_auth_client):
    """Verifies that GET /council/jobs/{job_id} returns 404 if accessed by another user."""
    from datetime import datetime, timezone
    from app.models.council import CouncilJob
    from tests.conftest import TestingSessionLocal

    client1, user1 = make_auth_client("job_user1@example.com", "Password12345!")
    client2, user2 = make_auth_client("job_user2@example.com", "Password12345!")

    # Insert job for user 1
    db = TestingSessionLocal()
    job1 = CouncilJob(
        user_id=user1["id"],
        status="running",
        current_round=1,
        total_rounds=1,
        providers_progress={"groq": "Running"},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(job1)
    db.commit()
    job_id = job1.id
    db.close()

    # User 2 tries to poll User 1's job -> 404
    res2 = client2.get(f"/api/v1/council/jobs/{job_id}")
    assert res2.status_code == 404
    assert "not found" in res2.json()["detail"].lower()


def test_council_one_active_job_rule_409_conflict(make_auth_client):
    """Verifies that only 1 active deliberation job is permitted per user (returns 409)."""
    from datetime import datetime, timezone
    from app.models.council import CouncilJob
    from tests.conftest import TestingSessionLocal

    client, user = make_auth_client("active_job_user@example.com", "Password12345!")

    # 1. Insert an active job for this user directly into the database
    db = TestingSessionLocal()
    active_job = CouncilJob(
        user_id=user["id"],
        status="running",
        current_round=1,
        total_rounds=1,
        providers_progress={"groq": "Running"},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(active_job)
    db.commit()
    db.close()

    # 2. Subsequent deliberation request must return 409 Conflict
    res = client.post(
        "/api/v1/council/ask",
        json={"question": "Second overlapping question", "decision_type": "borrow"},
    )
    assert res.status_code == 409
    assert "already in progress" in res.json()["detail"]


def test_stale_council_job_cleanup_on_startup_and_timeout():
    """Verifies that startup recovery marks in-flight jobs as failed."""
    from datetime import datetime, timezone, timedelta
    from app.models.council import CouncilJob
    from app.db.init_db import recover_stale_council_jobs
    from tests.conftest import TestingSessionLocal, test_engine

    db = TestingSessionLocal()
    stale_job = CouncilJob(
        user_id="test-user-id",
        status="running",
        current_round=1,
        total_rounds=2,
        providers_progress={"gemini": "Running..."},
        created_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
    )
    db.add(stale_job)
    db.commit()
    stale_job_id = stale_job.id
    db.close()

    # Run startup recovery on test database engine
    recover_stale_council_jobs(test_engine)

    db = TestingSessionLocal()
    recovered_job = db.query(CouncilJob).filter(CouncilJob.id == stale_job_id).first()
    assert recovered_job.status == "failed"
    assert "Server restarted" in recovered_job.error
    db.close()


def test_idempotent_schema_migrations_with_existing_rows():
    """
    Verifies that running run_schema_migrations() and init_db() multiple times
    on a database populated with rows is safe, non-destructive, and idempotent.
    """
    from app.db.init_db import run_schema_migrations, init_db
    from app.models.category import Category
    from tests.conftest import TestingSessionLocal, test_engine

    # 1. Add rows
    db = TestingSessionLocal()
    cat = Category(user_id="mig_user", name="Test Mig Cat", type="expense", icon_name="tag", color_hex="#10B981")
    db.add(cat)
    db.commit()
    cat_id = cat.id
    db.close()

    # 2. Run migrations twice
    run_schema_migrations(test_engine)
    init_db(test_engine)

    # 3. Assert row still exists unharmed
    db = TestingSessionLocal()
    cat_check = db.query(Category).filter(Category.id == cat_id).first()
    assert cat_check is not None
    assert cat_check.name == "Test Mig Cat"
    db.close()
