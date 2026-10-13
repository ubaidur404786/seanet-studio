"""
Tests for the small helpers around the LLM call. No network: the errors are built by hand.
"""
import httpx

from app.config import Settings
from app.explain import Explainer, clean_text, llm_error_reason


def _status_error(code: int, body: dict) -> httpx.HTTPStatusError:
    req = httpx.Request("POST", "https://example.test/chat/completions")
    return httpx.HTTPStatusError("boom", request=req, response=httpx.Response(code, json=body, request=req))


def test_error_reason_says_what_went_wrong():
    # this is the exact answer Groq gave for the retired model
    e = _status_error(404, {"error": {"message": "The model does not exist", "code": "model_not_found"}})
    assert llm_error_reason(e) == "404 model_not_found"
    assert llm_error_reason(_status_error(429, {"error": {"message": "Rate limit reached"}})) == "429 Rate limit reached"
    assert llm_error_reason(httpx.ReadTimeout("slow")) == "the provider took too long to answer"


def test_clean_text_swaps_odd_characters():
    assert clean_text("**Day 3 04:00‑07:00**") == "Day 3 04:00-07:00"


def test_no_key_means_off():
    assert Explainer(Settings(llm_api_key="")).status == "off (no LLM key)"
