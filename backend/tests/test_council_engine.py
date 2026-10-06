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
            display_name="Google Gemini",
            model_id="gemini-3.8-flash",
            model_family="Google Gemini Family",
            status="success",
            verdict="approve",
            confidence=90,
            reasoning="Low DTI and strong cashflow.",
        ),
        IndividualVote(
            provider_name="Groq",
            display_name="Groq GPT-OSS",
            model_id="openai/gpt-oss-120b",
            model_family="OpenAI / GPT-OSS Family",
            status="success",
            verdict="approve",
            confidence=80,
            reasoning="Ample runway to absorb debt.",
        ),
        IndividualVote(
            provider_name="Mistral",
            display_name="Mistral AI",
            model_id="mistral-small-latest",
            model_family="Mistral Family",
            status="success",
            verdict="approve",
            confidence=85,
            reasoning="Sustainable payment plan.",
        ),
    ]
    tally = _calculate_tally(votes, min_quorum=3)
    assert tally.final_verdict == "approve"
    assert tally.has_quorum is True
    assert tally.weighted_score > 0.8
    assert tally.is_tie is False
    assert tally.total_votes_counted == 3


def test_tally_calculation_unanimous_reject():
    votes = [
        IndividualVote(
            provider_name="Gemini",
            display_name="Google Gemini",
            model_id="gemini-3.8-flash",
            model_family="Google Gemini Family",
            status="success",
            verdict="reject",
            confidence=95,
            reasoning="DTI would exceed safe limits.",
            risks=["Severe debt spiral risk"],
        ),
        IndividualVote(
            provider_name="Mistral",
            display_name="Mistral AI",
            model_id="mistral-small-latest",
            model_family="Mistral Family",
            status="success",
            verdict="reject",
            confidence=85,
            reasoning="Runway is dangerously low.",
        ),
        IndividualVote(
            provider_name="NVIDIA",
            display_name="NVIDIA GLM",
            model_id="z-ai/glm-5.3-flash",
            model_family="Zhipu GLM",
            status="success",
            verdict="reject",
            confidence=90,
            reasoning="High interest rate burden.",
        ),
    ]
    tally = _calculate_tally(votes, min_quorum=3)
    assert tally.final_verdict == "reject"
    assert tally.has_quorum is True
    assert tally.weighted_score < -0.8
    assert tally.is_tie is False


def test_tally_calculation_split_decision():
    votes = [
        IndividualVote(
            provider_name="Gemini",
            display_name="Google Gemini",
            model_id="gemini-3.8-flash",
            model_family="Google Gemini Family",
            status="success",
            verdict="approve",
            confidence=60,
            reasoning="Acceptable risk.",
        ),
        IndividualVote(
            provider_name="Groq",
            display_name="Groq GPT-OSS",
            model_id="openai/gpt-oss-120b",
            model_family="OpenAI / GPT-OSS Family",
            status="success",
            verdict="reject",
            confidence=60,
            reasoning="Too risky.",
        ),
        IndividualVote(
            provider_name="Mistral",
            display_name="Mistral AI",
            model_id="mistral-small-latest",
            model_family="Mistral Family",
            status="success",
            verdict="approve_with_conditions",
            confidence=50,
            reasoning="Only if interest is subsidized.",
        ),
    ]
    tally = _calculate_tally(votes, min_quorum=3)
    assert tally.final_verdict in ("split_decision", "approve_with_conditions")
    assert tally.has_quorum is True


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
    """
    Tests that providers sharing a rate limit key space out request STARTS (stagger interval),
    yet run CONCURRENTLY during execution (calls overlap in time).
    """
    import httpx

    start_times = []
    end_times = []

    async def mock_post(*args, **kwargs):
        t_start = asyncio.get_running_loop().time()
        start_times.append(t_start)
        # Each query simulates 0.15s of network time
        await asyncio.sleep(0.15)
        t_end = asyncio.get_running_loop().time()
        end_times.append(t_end)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "approve", "confidence": 75, "reasoning": "Overlap test valid", "risks": [], "conditions": [], "suggested_amount": null}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adapter1 = OpenAICompatibleAdapter(
        name="nvidia_glm",
        display_name="NVIDIA GLM",
        model_family="Zhipu GLM",
        model_id="z-ai/glm-5.3-flash",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-shared",
        shared_rate_limit_key="nvidia_test_shared_overlap",
        stagger_interval_seconds=0.08,
    )

    adapter2 = OpenAICompatibleAdapter(
        name="nvidia_kimi",
        display_name="Kimi (NVIDIA)",
        model_family="Moonshot Kimi",
        model_id="moonshotai/kimi-k3",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="nvapi-shared",
        shared_rate_limit_key="nvidia_test_shared_overlap",
        stagger_interval_seconds=0.08,
    )

    t0 = asyncio.get_running_loop().time()
    v1, v2 = await asyncio.gather(
        adapter1.query("Prompt 1", "Sys 1"),
        adapter2.query("Prompt 2", "Sys 2"),
    )
    t_total = asyncio.get_running_loop().time() - t0

    assert v1.status == "success"
    assert v2.status == "success"
    assert len(start_times) == 2
    assert len(end_times) == 2

    # 1. Starts are spaced out by at least the stagger interval
    assert start_times[1] - start_times[0] >= 0.07

    # 2. PROOF OF OVERLAP: Call 2 started BEFORE Call 1 finished!
    assert start_times[1] < end_times[0], (
        f"Calls did not run concurrently: Call 2 started at {start_times[1]:.3f}, "
        f"which was after Call 1 ended at {end_times[0]:.3f}"
    )

    # 3. Both calls executed concurrently
    assert t_total < 2.0


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
        assert "Google Gemini" in families
        assert "OpenAI" in families
        assert "Mistral AI" in families
        assert "Qwen" in families
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


def test_quorum_enforcement_and_no_quorum_verdict():
    """
    Verifies that when fewer than min_quorum valid votes are returned:
    - Final verdict is 'no_quorum'
    - Consensus message is 'Not enough votes'
    - has_quorum is False
    - When min_quorum is met, has_quorum is True and a valid verdict is produced
    """
    v1 = IndividualVote(
        provider_name="groq",
        display_name="Groq GPT-OSS",
        model_family="OpenAI / GPT-OSS Family",
        model_id="openai/gpt-oss-120b",
        status="success",
        verdict="approve",
        confidence=85,
        reasoning="Strong financial capacity.",
    )
    v2 = IndividualVote(
        provider_name="gemini",
        display_name="Google Gemini",
        model_family="Google Gemini Family",
        model_id="gemini-3.8-flash",
        status="success",
        verdict="approve",
        confidence=80,
        reasoning="Sensible cash flow.",
    )
    v_failed = IndividualVote(
        provider_name="mistral",
        display_name="Mistral AI",
        model_family="Mistral Family",
        model_id="mistral-small-latest",
        status="unavailable",
        error_message="Provider timeout after 25s",
    )

    # 1. Zero votes -> no_quorum
    tally0 = _calculate_tally([], min_quorum=3)
    assert tally0.final_verdict == "no_quorum"
    assert tally0.has_quorum is False
    assert "unavailable" in tally0.consensus_summary.lower()

    # 2. 2 valid votes with min_quorum=3 -> no_quorum (NOT split_decision / split tie)
    tally2 = _calculate_tally([v1, v2, v_failed], min_quorum=3)
    assert tally2.final_verdict == "no_quorum"
    assert tally2.has_quorum is False
    assert "Not enough votes" in tally2.consensus_summary

    # 3. 3 valid votes with min_quorum=3 -> Quorum met
    v3 = IndividualVote(
        provider_name="nvidia_glm",
        display_name="NVIDIA GLM",
        model_family="Zhipu GLM",
        model_id="z-ai/glm-5.3-flash",
        status="success",
        verdict="approve",
        confidence=75,
        reasoning="Safe loan amount.",
    )
    tally3 = _calculate_tally([v1, v2, v3], min_quorum=3)
    assert tally3.final_verdict == "approve"
    assert tally3.has_quorum is True
    assert "Approved" in tally3.consensus_summary or tally3.weighted_score > 0


def test_retry_failed_providers_endpoint(make_auth_client, monkeypatch):
    """
    Tests that POST /api/v1/council/decision/{decision_id}/retry-failed:
    - Re-queries ONLY the failed or unavailable providers
    - Preserves existing successful votes
    - Recalculates final tally with new votes
    """
    from app.models.council import CouncilDecision
    from app.config import settings
    from tests.conftest import TestingSessionLocal
    import httpx

    client, user = make_auth_client("retry_test_user@example.com", "Password123!")

    # Set keys so providers are configured
    orig_gemini = settings.GEMINI_API_KEY
    orig_groq = settings.GROQ_API_KEY
    orig_mistral = settings.MISTRAL_API_KEY
    settings.GEMINI_API_KEY = "test_gemini_retry"
    settings.GROQ_API_KEY = "test_groq_retry"
    settings.MISTRAL_API_KEY = "test_mistral_retry"

    try:
        # 1. Insert a decision with 1 successful vote and 2 failed votes
        db = TestingSessionLocal()
        decision = CouncilDecision(
            user_id=user["id"],
            question="Should I borrow 5,000 for equipment?",
            decision_type="borrow",
            candidate_amount=Decimal("5000.00"),
            enable_debate=False,
            local_only_mode=False,
            status="completed",
            financial_snapshot={"has_sufficient_data": True, "monthly_income": 8000.0, "current_runway_display": "6.0 months"},
            round1_votes={
                "groq": {
                    "provider_name": "groq",
                    "display_name": "Groq GPT-OSS",
                    "model_family": "OpenAI / GPT-OSS Family",
                    "model_id": "openai/gpt-oss-120b",
                    "status": "success",
                    "verdict": "approve",
                    "confidence": 85,
                    "reasoning": "Sufficient cash flow.",
                    "risks": [],
                    "conditions": [],
                    "suggested_amount": 5000.0,
                    "latency_ms": 1200,
                },
                "gemini": {
                    "provider_name": "gemini",
                    "display_name": "Google Gemini",
                    "model_family": "Google Gemini Family",
                    "model_id": "gemini-3.8-flash",
                    "status": "unavailable",
                    "error_message": "Request timed out after 25s",
                    "latency_ms": 25000,
                },
                "mistral": {
                    "provider_name": "mistral",
                    "display_name": "Mistral AI",
                    "model_family": "Mistral Family",
                    "model_id": "mistral-small-latest",
                    "status": "unavailable",
                    "error_message": "Rate limit exceeded (429)",
                    "latency_ms": 450,
                },
            },
            round2_votes=None,
            final_tally={
                "final_verdict": "no_quorum",
                "has_quorum": False,
                "min_quorum_required": 3,
                "consensus_summary": "Not enough votes: Only 1 of 3 required valid votes were collected.",
                "weighted_score": 0.0,
                "key_agreements": [],
                "key_disagreements": [],
                "is_tie": False,
                "total_votes_counted": 1,
                "total_votes_skipped": 2,
            },
        )
        db.add(decision)
        db.commit()
        decision_id = decision.id
        db.close()

        queried_providers = []

        # Mock outbound calls during retry
        async def mock_post(client_obj, url, *args, **kwargs):
            url_str = str(url)
            queried_providers.append(url_str)
            if "generativelanguage.googleapis.com" in url_str:
                return httpx.Response(
                    200,
                    json={
                        "candidates": [
                            {
                                "finishReason": "STOP",
                                "content": {
                                    "parts": [
                                        {
                                            "text": '{"verdict": "approve", "confidence": 90, "reasoning": "Strong runway and healthy business.", "risks": [], "conditions": [], "suggested_amount": 5000.0}'
                                        }
                                    ]
                                },
                            }
                        ]
                    },
                    request=httpx.Request("POST", url_str),
                )
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "content": '{"verdict": "approve", "confidence": 80, "reasoning": "Manageable debt load.", "risks": [], "conditions": [], "suggested_amount": 5000.0}'
                            }
                        }
                    ]
                },
                request=httpx.Request("POST", url_str),
            )

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

        # 2. Call Retry Endpoint (returns CouncilJobStatus background job)
        res = client.post(f"/api/v1/council/decision/{decision_id}/retry-failed")
        assert res.status_code == 200
        job_status = res.json()
        assert "job_id" in job_status
        job_id = job_status["job_id"]

        # Poll job status until completed
        import time
        data = None
        for _ in range(50):
            poll_res = client.get(f"/api/v1/council/jobs/{job_id}")
            assert poll_res.status_code == 200
            poll_data = poll_res.json()
            if poll_data["status"] == "completed":
                data = poll_data["decision"]
                break
            time.sleep(0.05)

        if not data:
            dec_res = client.get(f"/api/v1/council/decision/{decision_id}")
            assert dec_res.status_code == 200
            data = dec_res.json()

        # 3. Verify that groq was NOT re-queried (only failed providers were queried)
        assert not any("groq.com" in u for u in queried_providers)
        assert any("googleapis.com" in u for u in queried_providers)

        # 4. Verify round 1 votes: groq preserved, gemini and mistral now successful
        r1 = data["round1_votes"]
        assert r1["groq"]["status"] == "success"
        assert r1["groq"]["reasoning"] == "Sufficient cash flow."
        assert r1["gemini"]["status"] == "success"
        assert r1["gemini"]["verdict"] == "approve"
        assert r1["mistral"]["status"] == "success"
        assert r1["mistral"]["verdict"] == "approve"

        # 5. Verify final tally achieved quorum
        tally = data["final_tally"]
        assert tally["has_quorum"] is True
        assert tally["final_verdict"] == "approve"
        assert tally["total_votes_counted"] >= 3
    finally:
        settings.GEMINI_API_KEY = orig_gemini
        settings.GROQ_API_KEY = orig_groq
        settings.MISTRAL_API_KEY = orig_mistral


def test_insufficient_data_guardrail_bypass_and_notice(make_auth_client):
    """
    Verifies that when user has < 14 days of spending history or < 3 transactions:
    - has_sufficient_data is False
    - data_notice is 'Add at least 2 weeks of spending for reliable advice.'
    - current_runway_display is 'Not enough data' (not 0.0)
    - Runway guardrails are NOT triggered even if runway math would be zero
    - Adding >= 14 days of transactions restores normal runway metrics
    """
    from datetime import date, timedelta
    from app.models.transaction import Transaction
    from app.services.financial_math import calculate_user_financial_snapshot
    from app.services.privacy import build_anonymized_council_context
    from tests.conftest import TestingSessionLocal

    client, user = make_auth_client("insufficient_data_user@example.com", "Password123!")
    user_id = user["id"]

    db = TestingSessionLocal()

    # Case A: Brand new user with only 1 recent transaction (3 days ago)
    t1 = Transaction(
        user_id=user_id,
        amount=Decimal("150.00"),
        type="expense",
        date=date.today() - timedelta(days=3),
        description="Groceries",
    )
    db.add(t1)
    db.commit()

    snap_few = calculate_user_financial_snapshot(db, user_id=user_id, min_runway_threshold=3.0)
    assert snap_few["has_sufficient_data"] is False
    assert snap_few["data_notice"] == "Add at least 2 weeks of spending for reliable advice."
    assert snap_few["current_runway_display"] == "Not enough data"
    assert snap_few["current_runway_months"] is None
    # Crucial: Guardrail must NOT be breached for missing runway data
    assert snap_few["guardrail_breached"] is False
    assert not any("runway" in v.lower() for v in snap_few["guardrail_violations"])

    # Check anonymized context text representation
    ctx_text = build_anonymized_council_context(snap_few, "GHS")
    assert "Not enough data" in ctx_text
    assert "Add at least 2 weeks of spending for reliable advice." in ctx_text

    # Case B: Add transactions spanning at least 15 days and >= 3 total
    t2 = Transaction(
        user_id=user_id,
        amount=Decimal("200.00"),
        type="expense",
        date=date.today() - timedelta(days=8),
        description="Utilities",
    )
    t3 = Transaction(
        user_id=user_id,
        amount=Decimal("300.00"),
        type="expense",
        date=date.today() - timedelta(days=16),
        description="Supplies",
    )
    db.add_all([t2, t3])
    db.commit()

    snap_sufficient = calculate_user_financial_snapshot(db, user_id=user_id, min_runway_threshold=3.0)
    assert snap_sufficient["has_sufficient_data"] is True
    assert snap_sufficient["data_notice"] is None
    assert snap_sufficient["current_runway_display"] != "Not enough data"
    assert "months" in snap_sufficient["current_runway_display"]
    assert snap_sufficient["current_runway_months"] is not None
    db.close()


@pytest.mark.asyncio
async def test_openai_adapter_thinking_optional_parameter_fallback(monkeypatch):
    """
    Tests that when an OpenAI-compatible provider (e.g. OpenRouter or NVIDIA)
    returns 400/422 mentioning an unsupported parameter:
    - Retries once immediately without the thinking parameters
    - Adds the provider name to _UNSUPPORTED_THINKING_PROVIDERS
    - Subsequent calls for that provider skip sending the thinking parameters
    """
    import httpx
    from app.services.council.base_adapter import OpenAICompatibleAdapter, _UNSUPPORTED_THINKING_PROVIDERS

    _UNSUPPORTED_THINKING_PROVIDERS.discard("nvidia_glm")

    calls = []

    async def mock_post(client_obj, url, *args, **kwargs):
        payload = kwargs.get("json", {})
        calls.append(payload)
        if "chat_template_kwargs" in payload:
            # Rejection due to unsupported parameter chat_template_kwargs
            return httpx.Response(
                422,
                json={"error": {"message": "Unrecognized parameter: chat_template_kwargs is not supported on this model"}},
                request=httpx.Request("POST", str(url)),
            )
        # Success when chat_template_kwargs is omitted
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "approve", "confidence": 85, "reasoning": "Fallback worked.", "risks": [], "conditions": [], "suggested_amount": null}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adapter = OpenAICompatibleAdapter(
        name="nvidia_glm",
        display_name="NVIDIA GLM",
        model_family="Zhipu GLM",
        model_id="z-ai/glm-5.3-flash",
        base_url="https://integrate.api.nvidia.com/v1",
        api_key="test-key",
    )

    vote = await adapter.query("Test question", "Test instruction")
    assert vote.status == "success"
    assert vote.verdict == "approve"
    assert len(calls) == 2

    # First call had chat_template_kwargs, second call had it removed
    assert "chat_template_kwargs" in calls[0]
    assert "chat_template_kwargs" not in calls[1]
    assert "nvidia_glm" in _UNSUPPORTED_THINKING_PROVIDERS

    # Next call for this provider should skip chat_template_kwargs entirely
    calls.clear()
    vote2 = await adapter.query("Second question", "Second instruction")
    assert vote2.status == "success"
    assert len(calls) == 1
    assert "chat_template_kwargs" not in calls[0]

    _UNSUPPORTED_THINKING_PROVIDERS.discard("nvidia_glm")


@pytest.mark.asyncio
async def test_connection_tester_unsupported_thinking_parameter_diagnosis(monkeypatch):
    """
    Tests that verify_provider_connectivity diagnoses 400/422 unsupported thinking
    parameters and verifies connectivity with 'thinking control not supported'.
    """
    import httpx
    from app.services.council.connection_tester import verify_provider_connectivity, _UNSUPPORTED_THINKING_PROVIDERS

    calls = []

    async def mock_post(client_obj, url, *args, **kwargs):
        calls.append(kwargs.get("json", {}))
        if len(calls) == 1:
            return httpx.Response(
                400,
                text="Unsupported parameter: reasoning_effort is not valid for this endpoint",
                request=httpx.Request("POST", str(url)),
            )
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"status": "ok"}'}}]},
            request=httpx.Request("POST", str(url)),
        )

    async def mock_get(client_obj, url, *args, **kwargs):
        return httpx.Response(
            200,
            json={"data": [{"id": "meta/llama-3.3-70b-instruct"}]},
            request=httpx.Request("GET", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = await verify_provider_connectivity(
        provider_name="openrouter",
        model_id="meta/llama-3.3-70b-instruct",
        user_settings={},
    )

    assert res.status == "success"
    assert res.http_status == 200
    assert "thinking control not supported" in res.diagnosis.lower()


def test_insufficient_data_caps_confidence_at_40_and_includes_prompt_flag(make_auth_client, monkeypatch):
    """
    Tests that when financial history is insufficient (< 14 days):
    1. Prompt includes DATA QUALITY: INSUFFICIENT_HISTORY and low-confidence instructions
    2. Any provider vote returning confidence > 40 is capped at 40 by the engine
    """
    from datetime import date, timedelta
    from app.models.transaction import Transaction
    from app.config import settings
    from tests.conftest import TestingSessionLocal
    import httpx

    orig_groq = settings.GROQ_API_KEY
    settings.GROQ_API_KEY = "test_groq_cap"

    try:
        client, user = make_auth_client("insufficient_cap_user@example.com", "Password123!")
        user_id = user["id"]

        db = TestingSessionLocal()
        # Add only 1 transaction so data is insufficient
        db.add(Transaction(
            user_id=user_id,
            amount=Decimal("50.00"),
            type="expense",
            date=date.today() - timedelta(days=2),
            description="Coffee",
        ))
        db.commit()
        db.close()

        captured_prompts = []

        async def mock_post(client_obj, url, *args, **kwargs):
            body = kwargs.get("json", {})
            captured_prompts.append(str(body))
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                # Model ignores prompt instruction and returns 95 confidence
                                "content": '{"verdict": "approve", "confidence": 95, "reasoning": "Looks okay.", "risks": [], "conditions": [], "suggested_amount": 1000.0}'
                            }
                        }
                    ]
                },
                request=httpx.Request("POST", str(url)),
            )

        monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

        res = client.post(
            "/api/v1/council/ask",
            json={"question": "Should I borrow 1000?", "decision_type": "borrow", "candidate_amount": "1000.00"},
        )
        assert res.status_code == 200
        job_id = res.json()["job_id"]

        # Poll until job completes
        import time
        decision = None
        for _ in range(50):
            poll_res = client.get(f"/api/v1/council/jobs/{job_id}")
            if poll_res.json()["status"] == "completed":
                decision = poll_res.json()["decision"]
                break
            time.sleep(0.05)

        assert decision is not None
        # Verify prompt contained data quality flag and instructions
        assert any("DATA QUALITY: INSUFFICIENT_HISTORY" in p for p in captured_prompts)
        assert any("cap your confidence" in p.lower() and "40%" in p for p in captured_prompts)

        # Verify that vote confidence was strictly capped at 40
        for v in decision["round1_votes"].values():
            if v.get("status") == "success" and v.get("confidence") is not None:
                assert v["confidence"] <= 40
    finally:
        settings.GROQ_API_KEY = orig_groq


def test_retry_job_ownership_404_and_409_conflict(make_auth_client):
    """
    Tests that POST /api/v1/council/decision/{decision_id}/retry-failed:
    - Returns 404 if decision belongs to another user
    - Returns 409 if an active deliberation/retry job is already running for the user
    """
    from datetime import datetime, timezone
    from app.models.council import CouncilDecision, CouncilJob
    from tests.conftest import TestingSessionLocal

    client1, user1 = make_auth_client("retry_user1@example.com", "Password123!")
    client2, user2 = make_auth_client("retry_user2@example.com", "Password123!")

    # 1. Create a decision owned by user 1
    db = TestingSessionLocal()
    dec1 = CouncilDecision(
        user_id=user1["id"],
        question="User 1 inquiry",
        decision_type="borrow",
        status="completed",
        financial_snapshot={"has_sufficient_data": True},
        round1_votes={"groq": {"status": "unavailable", "provider_name": "groq"}},
    )
    db.add(dec1)
    db.commit()
    dec1_id = dec1.id
    db.close()

    # User 2 tries to retry User 1's decision -> 404
    res_404 = client2.post(f"/api/v1/council/decision/{dec1_id}/retry-failed")
    assert res_404.status_code == 404

    # 2. Add an active running job for User 1
    db = TestingSessionLocal()
    active_job = CouncilJob(
        user_id=user1["id"],
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

    # User 1 tries to retry while active job exists -> 409
    res_409 = client1.post(f"/api/v1/council/decision/{dec1_id}/retry-failed")
    assert res_409.status_code == 409
    assert "already in progress" in res_409.json()["detail"]
    assert "Job ID:" in res_409.json()["detail"]


def test_log_safety_and_api_key_redaction(make_auth_client, monkeypatch):
    """
    1. LOG SAFETY:
    - Asserts that API keys, tokens, and Authorization headers are redacted from logs and API error responses.
    - Asserts no key text appears in captured logs or response bodies even during provider failures.
    """
    import logging
    import httpx
    from app.core.security import redact_sensitive_info
    from app.core.logging_config import setup_secure_logging, SensitiveDataRedactingFilter

    setup_secure_logging()
    client, user = make_auth_client("log_safety@example.com", "Password123!")

    secret_key = "sk-super-secret-key-998877665544332211"
    
    # 1. Verify redact_sensitive_info utility
    sample_text = f"Error sending request with Bearer {secret_key} and URL https://api.example.com/v1?key={secret_key}"
    redacted = redact_sensitive_info(sample_text)
    assert secret_key not in redacted
    assert "[REDACTED]" in redacted

    # 2. Verify SensitiveDataRedactingFilter directly mutates log records
    filter_obj = SensitiveDataRedactingFilter()
    rec = logging.LogRecord(
        name="httpx",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg=f"HTTP Request failed: https://api.example.com?key={secret_key} Bearer {secret_key}",
        args=(),
        exc_info=None,
    )
    filter_obj.filter(rec)
    assert secret_key not in rec.msg
    assert "[REDACTED]" in rec.msg

    # 3. Trigger a provider error with secret key in raw response body
    async def mock_error_post(*args, **kwargs):
        return httpx.Response(
            500,
            text=f"Internal Server Error: Failed token auth with key {secret_key}",
            request=httpx.Request("POST", f"https://api.mistral.ai/v1/chat/completions?key={secret_key}"),
        )

    async def mock_get(*args, **kwargs):
        return httpx.Response(
            500,
            text=f"Catalog error for token {secret_key}",
            request=httpx.Request("GET", f"https://api.mistral.ai/v1/models?key={secret_key}"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_error_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    res = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "mistral", "model_id": "mistral-small-latest"},
    )

    assert res.status_code == 200
    data = res.json()
    # Key must not appear anywhere in response text or json
    assert secret_key not in res.text
    assert secret_key not in str(data)


def test_cancel_stuck_deliberation_job_frees_slot(make_auth_client, monkeypatch):
    """
    2. CANCEL STUCK JOBS:
    - POST /council/jobs/{job_id}/cancel (auth, CSRF, ownership check) marks the job cancelled
      and frees the user's active-job slot.
    - 409 error message reports the active job ID.
    """
    import httpx
    from datetime import datetime, timezone
    from app.models.council import CouncilJob, CouncilDecision
    from tests.conftest import TestingSessionLocal

    client1, user1 = make_auth_client("cancel_user1@example.com", "Password123!")
    client2, user2 = make_auth_client("cancel_user2@example.com", "Password123!")

    # 1. Create active job for user 1
    db = TestingSessionLocal()
    job1 = CouncilJob(
        id="job-to-cancel-123",
        user_id=user1["id"],
        status="running",
        current_round=1,
        total_rounds=2,
        providers_progress={"groq": "Running"},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    dec1 = CouncilDecision(
        id="job-to-cancel-123",
        user_id=user1["id"],
        question="Active deliberation question",
        decision_type="borrow",
        status="running",
        financial_snapshot={"has_sufficient_data": True},
    )
    db.add(job1)
    db.add(dec1)
    db.commit()
    db.close()

    # User 1 tries to start another job -> gets 409 specifying Job ID
    res_409 = client1.post(
        "/api/v1/council/ask",
        json={"question": "Another inquiry", "decision_type": "borrow", "candidate_amount": "500.00"},
    )
    assert res_409.status_code == 409
    detail = res_409.json()["detail"]
    assert "job-to-cancel-123" in detail

    # User 2 tries to cancel User 1's job -> 404
    res_404 = client2.post("/api/v1/council/jobs/job-to-cancel-123/cancel")
    assert res_404.status_code == 404

    # User 1 cancels the active job -> 200
    res_cancel = client1.post("/api/v1/council/jobs/job-to-cancel-123/cancel")
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"

    # Verify slot is freed in DB
    db = TestingSessionLocal()
    updated_job = db.query(CouncilJob).filter(CouncilJob.id == "job-to-cancel-123").first()
    assert updated_job.status == "cancelled"
    db.close()

    # Mock fast provider response so ask2 completes immediately
    async def mock_post(*args, **kwargs):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"verdict": "approve", "confidence": 85, "reasoning": "Looks solid", "risks": [], "conditions": []}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions"),
        )
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    # User 1 can now immediately launch a new deliberation without 409
    res_ask2 = client1.post(
        "/api/v1/council/ask",
        json={"question": "Fresh inquiry after cancel", "decision_type": "borrow", "candidate_amount": "500.00"},
    )
    assert res_ask2.status_code == 200
    assert res_ask2.json()["job_id"] != "job-to-cancel-123"


@pytest.mark.asyncio
async def test_rate_limit_retry_after_and_minimum_interval(monkeypatch):
    """
    3. RATE LIMIT HANDLING:
    - On 429, honours Retry-After header, retries once, then reports 'rate limited, retry in N seconds'.
    - Serialises calls to the same provider with minimum request interval.
    """
    import httpx
    import time
    from app.services.council.base_adapter import OpenAICompatibleAdapter, parse_retry_after

    assert parse_retry_after("5") == 5
    assert parse_retry_after("invalid") == 1

    adapter = OpenAICompatibleAdapter(
        name="mistral",
        display_name="Mistral AI",
        model_family="Mistral Family",
        model_id="mistral-small-latest",
        base_url="https://api.mistral.ai/v1",
        api_key="sk-mistral-key",
        min_request_interval_seconds=0.05,
    )

    call_count = 0

    async def mock_429_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            429,
            headers={"Retry-After": "8"},
            json={"error": {"message": "Rate limit exceeded"}},
            request=httpx.Request("POST", "https://api.mistral.ai/v1/chat/completions"),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_429_post)

    vote = await adapter.query("Prompt", "Instruction", timeout_seconds=5)
    assert vote.status == "rate_limited"
    assert "retry in 8 seconds" in (vote.error_message or "").lower()
    # Should attempt up to 2 calls (initial + 1 retry if Retry-After <= 5s, or report immediately)
    assert call_count >= 1


@pytest.mark.asyncio
async def test_two_probe_nvidia_diagnosis_on_timeout(monkeypatch):
    """
    4. TEST TIMEOUTS AND PROBES:
    - For NVIDIA, runs two probes when chat probe fails with extra parameters:
      first with extras (chat_template_kwargs/thinking), then without them (clean).
    - Reports which one worked, and separates 'catalog ok' and 'chat status'.
    """
    import httpx
    from app.services.council.connection_tester import verify_provider_connectivity

    call_payloads = []

    async def mock_nvidia_post(client_obj, url, *args, **kwargs):
        payload = kwargs.get("json", {})
        call_payloads.append(payload)
        # First probe with extra parameters hangs / returns 400 parameter error
        if "chat_template_kwargs" in payload:
            return httpx.Response(
                400,
                json={"error": {"code": "invalid_parameter", "param": "chat_template_kwargs", "message": "Unknown parameter chat_template_kwargs"}},
                request=httpx.Request("POST", str(url)),
            )
        # Second clean probe succeeds
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"status": "ok"}'}}]},
            request=httpx.Request("POST", str(url)),
        )

    async def mock_nvidia_get(client_obj, url, *args, **kwargs):
        return httpx.Response(
            200,
            json={"data": [{"id": "z-ai/glm-5.3-flash"}]},
            request=httpx.Request("GET", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_nvidia_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_nvidia_get)

    res = await verify_provider_connectivity(
        provider_name="nvidia",
        model_id="z-ai/glm-5.3-flash",
        user_settings={},
    )

    assert res.status == "success"
    assert res.catalog_ok is True
    assert res.chat_status == "ok"
    assert "thinking control not supported" in res.diagnosis.lower()
    # Assert 2 probes were executed: 1 with extras, 1 without
    assert len(call_payloads) == 2
    assert "chat_template_kwargs" in call_payloads[0]
    assert "chat_template_kwargs" not in call_payloads[1]


@pytest.mark.asyncio
async def test_catalog_pricing_free_vs_paid_and_openrouter_privacy(monkeypatch):
    """
    5. CATALOG AND PRICING:
    - Stores pricing from catalogs. Suggestions show [Free] or [Paid].
    - OpenRouter returns free models list (zero prompt & completion price), ordered by name.
    - When a ':free' model returns 404, shows privacy hint with link to OpenRouter privacy page.
    """
    import httpx
    from app.services.council.connection_tester import verify_provider_connectivity

    async def mock_or_post(client_obj, url, *args, **kwargs):
        return httpx.Response(
            404,
            json={"error": {"message": "Model 'qwen/qwen-typo:free' not found"}},
            request=httpx.Request("POST", str(url)),
        )

    async def mock_or_get(client_obj, url, *args, **kwargs):
        return httpx.Response(
            200,
            json={
                "data": [
                    {"id": "qwen/qwen-2.5-72b-instruct", "pricing": {"prompt": "0.000001", "completion": "0.000002"}},
                    {"id": "qwen/qwen3.8-27b:free", "pricing": {"prompt": "0", "completion": "0"}},
                    {"id": "google/gemma-2-9b-it:free", "pricing": {"prompt": "0", "completion": "0"}},
                    {"id": "meta-llama/llama-3.3-70b-instruct", "pricing": {"prompt": "0.000001", "completion": "0.000001"}},
                ]
            },
            request=httpx.Request("GET", str(url)),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_or_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_or_get)

    res = await verify_provider_connectivity(
        provider_name="openrouter",
        model_id="qwen/qwen-typo:free",
        user_settings={},
    )

    assert res.status == "model_not_found"
    # Verify free_models list contains only 0-price models sorted alphabetically
    assert res.free_models == ["google/gemma-2-9b-it:free", "qwen/qwen3.8-27b:free"]
    # Verify suggestions tag [Free] and [Paid]
    assert any("[Free]" in m for m in res.close_matches)
    # Verify privacy hint on :free 404
    assert res.privacy_hint is not None
    assert "privacy settings" in res.privacy_hint.lower()


def test_circuit_breaker_tripping_and_reset(make_auth_client):
    """
    6. CIRCUIT BREAKER:
    - Provider failing 3 times in a row trips circuit breaker for 10 minutes.
    - Subsequent deliberation skips the provider immediately without timeout wait.
    - POST /council/providers/{provider_name}/reset-circuit-breaker resets it.
    """
    from tests.conftest import TestingSessionLocal
    from app.services.council.health_manager import (
        record_provider_failure,
        is_circuit_breaker_active,
        reset_circuit_breaker,
    )

    db = TestingSessionLocal()
    # Clear any leftover state
    reset_circuit_breaker(db, "mistral")

    # Fail 1
    tripped = record_provider_failure(db, "mistral", "timeout")
    assert tripped is False
    active, _, _ = is_circuit_breaker_active(db, "mistral")
    assert active is False

    # Fail 2
    tripped = record_provider_failure(db, "mistral", "500 Internal Error")
    assert tripped is False

    # Fail 3 -> Trips
    tripped = record_provider_failure(db, "mistral", "rate_limited")
    assert tripped is True
    active, reason, secs = is_circuit_breaker_active(db, "mistral")
    assert active is True
    assert "rate_limited" in (reason or "")
    assert secs is not None and secs > 0

    client, user = make_auth_client("cb_user@example.com", "Password123!")

    # Check /council/providers reports circuit_breaker_tripped
    res_p = client.get("/api/v1/council/providers")
    assert res_p.status_code == 200
    mistral_item = next(p for p in res_p.json() if p["name"] == "mistral")
    assert mistral_item["circuit_breaker_tripped"] is True
    assert mistral_item["status"] == "circuit_breaker_tripped"

    # Reset circuit breaker via API
    res_reset = client.post("/api/v1/council/providers/mistral/reset-circuit-breaker")
    assert res_reset.status_code == 200
    assert res_reset.json()["status"] == "ok"

    # Verify active state is now False
    active2, _, _ = is_circuit_breaker_active(db, "mistral")
    assert active2 is False
    db.close()


def test_parameter_fallback_persisted_in_database_with_expiry():
    """
    7. PARAMETER FALLBACK IN DB:
    - Persists 'thinking control not supported' per provider and model in DB with 7-day expiry.
    - Matches structured error fields (code, param, type, message).
    """
    from datetime import datetime, timezone, timedelta
    from tests.conftest import TestingSessionLocal
    from app.models.council import ProviderParamFallback
    from app.services.council.health_manager import (
        record_thinking_support_db,
        get_thinking_support_db,
    )

    db = TestingSessionLocal()
    
    # Clean prior record
    db.query(ProviderParamFallback).filter(
        ProviderParamFallback.provider_name == "test_prov",
        ProviderParamFallback.model_id == "test-model-1",
    ).delete()
    db.commit()

    # Record unsupported
    record_thinking_support_db(db, "test_prov", "test-model-1", supported=False)
    
    supp = get_thinking_support_db(db, "test_prov", "test-model-1")
    assert supp is False

    # Simulate expiry > 7 days
    rec = db.query(ProviderParamFallback).filter(
        ProviderParamFallback.provider_name == "test_prov",
        ProviderParamFallback.model_id == "test-model-1",
    ).first()
    rec.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()

    # Expired should return None and clean record
    supp_expired = get_thinking_support_db(db, "test_prov", "test-model-1")
    assert supp_expired is None
    db.close()


@pytest.mark.asyncio
async def test_circuit_breaker_test_button_does_not_trip_and_429_short_wait(monkeypatch):
    """
    CIRCUIT BREAKER VALIDATIONS:
    - Only real Council calls count toward the 3-failure threshold. Test button calls must NOT count.
    - 429 with Retry-After under 60 seconds is treated as a short wait rather than a failure.
    - Reset the failure count after any success.
    """
    import httpx
    from tests.conftest import TestingSessionLocal
    from app.models.council import ProviderCircuitBreaker
    from app.services.council.connection_tester import verify_provider_connectivity
    from app.services.council.health_manager import (
        record_provider_failure,
        record_provider_success,
        is_circuit_breaker_active,
        reset_circuit_breaker,
    )

    db = TestingSessionLocal()
    reset_circuit_breaker(db, "groq")

    # 1. Simulate 5 consecutive Test Button failures
    async def mock_fail_post(client_obj, url, *args, **kwargs):
        return httpx.Response(500, text="Internal Server Error", request=httpx.Request("POST", str(url)))

    async def mock_fail_get(client_obj, url, *args, **kwargs):
        return httpx.Response(500, text="Catalog error", request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_fail_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_fail_get)

    for _ in range(5):
        res = await verify_provider_connectivity(
            provider_name="groq",
            model_id="openai/gpt-oss-120b",
            user_settings={},
            db=db,
        )
        assert res.status == "error"

    # Verify Test Button calls DID NOT increment consecutive failures or trip the breaker
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == "groq").first()
    assert cb is not None
    assert cb.consecutive_failures == 0
    assert cb.is_tripped is False

    # 2. Verify 429 with Retry-After < 60s is treated as short wait (does not increment failure count)
    tripped = record_provider_failure(db, "groq", reason="rate_limited", retry_after_seconds=10)
    assert tripped is False
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == "groq").first()
    assert cb.consecutive_failures == 0

    # 3. Verify real Council failures increment and trip at 3
    record_provider_failure(db, "groq", reason="timeout")
    record_provider_failure(db, "groq", reason="500")
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == "groq").first()
    assert cb.consecutive_failures == 2
    assert cb.is_tripped is False

    # 4. Verify any success resets consecutive failures
    record_provider_success(db, "groq")
    cb = db.query(ProviderCircuitBreaker).filter(ProviderCircuitBreaker.provider_name == "groq").first()
    assert cb.consecutive_failures == 0
    assert cb.is_tripped is False

    # 5. Verify 3 real failures trip the circuit breaker
    record_provider_failure(db, "groq", reason="timeout")
    record_provider_failure(db, "groq", reason="timeout")
    tripped3 = record_provider_failure(db, "groq", reason="timeout")
    assert tripped3 is True
    active, reason, secs = is_circuit_breaker_active(db, "groq")
    assert active is True
    assert reason == "timeout"
    assert secs is not None and secs > 0

    db.close()


def test_test_connection_rate_limit_20_per_minute(make_auth_client, monkeypatch):
    """
    RATE LIMITING:
    - Rate limit /council/test-connection at 20/minute per user/IP,
      so 'Test all providers' can be pressed twice a minute without hitting rate limits.
    - The 21st request within the minute returns 429.
    """
    import httpx
    from app.core.limiter import limiter

    async def mock_fast_post(client_obj, url, *args, **kwargs):
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"status": "ok", "ping": "pong"}'}}]}, request=httpx.Request("POST", str(url)))

    async def mock_fast_get(client_obj, url, *args, **kwargs):
        return httpx.Response(200, json={"data": [{"id": "mistral-small-latest"}]}, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_fast_post)
    monkeypatch.setattr(httpx.AsyncClient, "get", mock_fast_get)

    client, user = make_auth_client("rate_lim_user@example.com", "Password123!")

    # SlowAPI in-memory storage reset for isolation
    try:
        limiter.reset()
    except Exception:
        pass

    async def mock_noop_pacing(provider, interval=None):
        pass

    monkeypatch.setattr("app.services.council.connection_tester.wait_for_provider_pacing", mock_noop_pacing)

    # First 20 requests succeed
    for i in range(20):
        res = client.post(
            "/api/v1/council/test-connection",
            json={"provider_name": "mistral", "model_id": "mistral-small-latest"},
        )
        assert res.status_code == 200, f"Request {i+1} failed with status {res.status_code}"

    # 21st request hits 429 Too Many Requests
    res21 = client.post(
        "/api/v1/council/test-connection",
        json={"provider_name": "mistral", "model_id": "mistral-small-latest"},
    )
    assert res21.status_code == 429


def test_catalog_filtering_chat_models():
    """
    CATALOG FILTERING:
    - Exclude embeddings, audio/speech (whisper, tts), image generation, moderation/guard, and rerank models.
    - Uses provider metadata where it exists (Gemini supportedGenerationMethods, OpenRouter output modalities)
      and name-based rules as fallback.
    """
    from app.services.council.connection_tester import is_chat_capable_model

    # 1. Non-chat model names should be excluded
    assert is_chat_capable_model("text-embedding-3-small") is False
    assert is_chat_capable_model("bge-large-en-v1.5") is False
    assert is_chat_capable_model("whisper-large-v3") is False
    assert is_chat_capable_model("tts-1-hd") is False
    assert is_chat_capable_model("dall-e-3") is False
    assert is_chat_capable_model("black-forest-labs/flux-1-schnell") is False
    assert is_chat_capable_model("meta-llama/llama-guard-3-8b") is False
    assert is_chat_capable_model("google/shieldgemma-9b") is False
    assert is_chat_capable_model("bge-reranker-large") is False

    # 2. Chat models should pass
    assert is_chat_capable_model("gemini-2.5-flash") is True
    assert is_chat_capable_model("openai/gpt-oss-120b") is True
    assert is_chat_capable_model("mistral-small-latest") is True
    assert is_chat_capable_model("deepseek/deepseek-chat") is True
    assert is_chat_capable_model("qwen/qwen-2.5-72b-instruct") is True

    # 3. Gemini metadata checks
    assert is_chat_capable_model("models/embedding-001", metadata={"supportedGenerationMethods": ["embedContent"]}) is False
    assert is_chat_capable_model("models/gemini-pro", metadata={"supportedGenerationMethods": ["generateContent", "countTokens"]}) is True

    # 4. OpenRouter metadata checks
    assert is_chat_capable_model("audio-model", metadata={"architecture": {"output_modalities": ["audio"]}}) is False
    assert is_chat_capable_model("chat-model", metadata={"architecture": {"output_modalities": ["text"]}}) is True


@pytest.mark.asyncio
async def test_free_label_rule_only_openrouter(monkeypatch):
    """
    FREE-LABEL ACCURACY:
    - Show a 'Free' badge only where the provider publishes prices (OpenRouter).
    - For other providers (Gemini, Groq, NVIDIA, Mistral), label the list:
      'Models available to your key (free-tier eligibility not published by this provider)'.
    - Do not treat missing price data as free anywhere.
    """
    import httpx
    from app.services.council.connection_tester import _fetch_models_openai_compatible, verify_provider_connectivity

    async def mock_noop_pacing(provider, interval=None):
        pass

    monkeypatch.setattr("app.services.council.connection_tester.wait_for_provider_pacing", mock_noop_pacing)

    # 1. OpenRouter catalog with pricing
    async def mock_openrouter_get(client_obj, url, *args, **kwargs):
        data = {
            "data": [
                {"id": "meta-llama/llama-3.3-70b-instruct:free", "pricing": {"prompt": "0", "completion": "0"}, "architecture": {"output_modalities": ["text"]}},
                {"id": "anthropic/claude-3.5-sonnet", "pricing": {"prompt": "0.000003", "completion": "0.000015"}, "architecture": {"output_modalities": ["text"]}},
                {"id": "some-unknown/model", "pricing": {}, "architecture": {"output_modalities": ["text"]}}
            ]
        }
        return httpx.Response(200, json=data, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_openrouter_get)
    models, free_list, is_free_map = await _fetch_models_openai_compatible("https://openrouter.ai/api/v1", api_key="test-key", is_openrouter=True)
    assert is_free_map["meta-llama/llama-3.3-70b-instruct:free"] is True
    assert is_free_map["anthropic/claude-3.5-sonnet"] is False
    assert is_free_map["some-unknown/model"] is False  # Missing price data is NOT treated as free

    # 2. Non-OpenRouter catalog (Groq)
    async def mock_groq_get(client_obj, url, *args, **kwargs):
        data = {"data": [{"id": "openai/gpt-oss-120b"}, {"id": "llama-3.3-70b-versatile"}]}
        return httpx.Response(200, json=data, request=httpx.Request("GET", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_groq_get)
    g_models, g_free_list, g_is_free_map = await _fetch_models_openai_compatible("https://api.groq.com/openai/v1", api_key="test-key", is_openrouter=False)
    for m in g_models:
        assert g_is_free_map[m] is False
    assert len(g_free_list) == 0

    # 3. verify_provider_connectivity label check
    async def mock_groq_post(client_obj, url, *args, **kwargs):
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"status": "ok"}'}}]}, request=httpx.Request("POST", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_groq_post)
    conn_res = await verify_provider_connectivity("groq", "openai/gpt-oss-120b", {"groq_api_key": "gsk_test"})
    assert conn_res.available_models_label == "Models available to your key (free-tier eligibility not published by this provider)"
    assert conn_res.is_free is False


@pytest.mark.asyncio
async def test_transient_error_retries_and_fallback_model(monkeypatch):
    """
    TRANSIENT ERRORS AND FALLBACK MODELS:
    - On 503, 502, 529 or 'overloaded' responses and on 429, retry up to 2 times
      with exponential backoff and jitter.
    - If retries fail, query the fallback model and record model_used and is_fallback.
    """
    import httpx
    import json
    from app.services.council.base_adapter import OpenAICompatibleAdapter

    call_count = 0

    async def mock_post(client_obj, url, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        body = kwargs.get("json") or json.loads(kwargs.get("content") or "{}")
        model_req = body.get("model")
        
        # Primary model fails with 503 overloaded
        if model_req == "primary-model-id":
            return httpx.Response(503, text="Service Overloaded", request=httpx.Request("POST", str(url)))
        
        # Fallback model succeeds
        if model_req == "fallback-model-id":
            resp_content = json.dumps({
                "choices": [{
                    "message": {
                        "content": json.dumps({
                            "verdict": "approve",
                            "confidence": 85,
                            "reasoning": "Fallback model evaluated successfully."
                        })
                    }
                }]
            })
            return httpx.Response(200, text=resp_content, request=httpx.Request("POST", str(url)))

        return httpx.Response(400, text="Bad Request", request=httpx.Request("POST", str(url)))

    async def mock_fast_sleep(seconds):
        pass

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)
    monkeypatch.setattr("asyncio.sleep", mock_fast_sleep)

    adapter = OpenAICompatibleAdapter(
        name="groq",
        display_name="Groq",
        base_url="https://api.groq.com/openai/v1",
        api_key="gsk_test",
        model_id="primary-model-id",
        model_family="Meta Llama",
        fallback_model_id="fallback-model-id",
        min_request_interval_seconds=0.0,
    )

    vote = await adapter.query(prompt="Prompt", system_instruction="Instruction", timeout_seconds=10.0)
    assert vote.status == "success"
    assert vote.verdict == "approve"
    assert vote.model_used == "fallback-model-id"
    assert vote.is_fallback is True
    # 1 initial try + 2 retries on primary = 3 calls, then 1 call on fallback = 4 total calls
    assert call_count == 4


@pytest.mark.asyncio
async def test_rate_pacing_across_call_types():
    """
    RATE PACING:
    - Enforces a minimum interval between ALL requests to the same provider
      (catalog, test, and chat calls). Default 1.5s for mistral.
    """
    import time
    from app.services.council.base_adapter import wait_for_provider_pacing, _PROVIDER_LAST_CALLED

    provider = "mistral_test_pacing"
    # Set last called to now
    _PROVIDER_LAST_CALLED[provider] = time.monotonic()

    t0 = time.monotonic()
    # Pacing with 0.1s minimum interval for test speed
    await wait_for_provider_pacing(provider, min_interval_seconds=0.1)
    elapsed = time.monotonic() - t0
    assert elapsed >= 0.08, f"Expected pacing delay >= 0.08s, got {elapsed:.4f}s"


def test_dynamic_family_counting_and_diversity_warning():
    """
    FAMILY LABELS AND DIVERSITY:
    - Derive family labels dynamically from model ID.
    - Diversity warning must count distinct families among providers that are enabled AND healthy.
    - Warn when fewer than 4 work.
    """
    from app.services.council.adapters_factory import derive_model_family
    from app.services.council.engine import _calculate_tally
    from app.schemas.council import IndividualVote

    # 1. Test derivation rules
    assert derive_model_family("qwen/qwen-2.5-72b-instruct", "openrouter") == "Qwen"
    assert derive_model_family("nvidia/nemotron-4-340b", "nvidia") == "NVIDIA Nemotron"
    assert derive_model_family("deepseek-ai/deepseek-r1", "groq") == "DeepSeek"
    assert derive_model_family("z-ai/glm-4", "openrouter") == "Zhipu GLM"
    assert derive_model_family("moonshotai/kimi-k1.5", "nvidia_kimi") == "Moonshot Kimi"
    assert derive_model_family("google/gemma-2-27b", "groq") == "Google Gemma"
    assert derive_model_family("gemini-2.5-flash", "gemini") == "Google Gemini"
    assert derive_model_family("mistral-small-latest", "mistral") == "Mistral AI"
    assert derive_model_family("custom-model", "custom", env_override="Custom Family") == "Custom Family"

    # 2. Test diversity warning with fewer than 4 distinct working families
    votes = [
        IndividualVote(
            provider_name="Groq",
            display_name="Groq",
            model_id="qwen/qwen-2.5-72b",
            model_family="Qwen",
            status="success",
            verdict="approve",
            confidence=80,
            reasoning="OK",
        ),
        IndividualVote(
            provider_name="OpenRouter",
            display_name="OpenRouter",
            model_id="qwen/qwen-2.5-32b",
            model_family="Qwen",  # Same family!
            status="success",
            verdict="approve",
            confidence=85,
            reasoning="OK",
        ),
        IndividualVote(
            provider_name="Mistral",
            display_name="Mistral",
            model_id="mistral-small-latest",
            model_family="Mistral AI",
            status="success",
            verdict="approve",
            confidence=90,
            reasoning="OK",
        ),
        IndividualVote(
            provider_name="Gemini",
            display_name="Gemini",
            model_id="gemini-2.5-flash",
            model_family="Google Gemini",
            status="failed",  # Failed!
            error_message="Timeout",
        ),
    ]

    tally = _calculate_tally(votes, min_quorum=3)
    # Distinct working families: Qwen, Mistral AI = 2 (< 4)
    assert tally.active_families_count == 2
    assert tally.diversity_warning is not None
    assert "Low council diversity" in tally.diversity_warning
    assert "2 distinct model families" in tally.diversity_warning


@pytest.mark.asyncio
async def test_concurrent_nvidia_probes_and_capacity_diagnosis(monkeypatch):
    """
    SLOW PROVIDERS AND PROBES:
    - Cap each NVIDIA diagnostic probe at 45s and run the two probes concurrently.
    - If both fail/timeout, report 'provider-side capacity issue' and suggest alternative chat models.
    """
    import httpx
    from app.services.council.connection_tester import verify_provider_connectivity

    async def mock_noop_pacing(provider, interval=None):
        pass

    monkeypatch.setattr("app.services.council.connection_tester.wait_for_provider_pacing", mock_noop_pacing)

    # Mock catalog call returning alternative models
    async def mock_get(client_obj, url, *args, **kwargs):
        data = {
            "data": [
                {"id": "meta/llama-3.3-70b-instruct"},
                {"id": "mistralai/mixtral-8x22b-instruct-v0.1"},
                {"id": "deepseek-ai/deepseek-r1"},
            ]
        }
        return httpx.Response(200, json=data, request=httpx.Request("GET", str(url)))

    # Mock chat probes timing out / failing with 504
    async def mock_post(client_obj, url, *args, **kwargs):
        return httpx.Response(504, text="Gateway Timeout", request=httpx.Request("POST", str(url)))

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    res = await verify_provider_connectivity(
        provider_name="nvidia",
        model_id="deepseek-ai/deepseek-r1",
        user_settings={},
    )

    assert res.status == "timeout"
    assert "provider-side capacity issue" in res.diagnosis.lower()
    assert len(res.alternative_models) > 0
    assert "meta/llama-3.3-70b-instruct" in res.alternative_models





