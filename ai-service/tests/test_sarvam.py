"""Sarvam adapter tests with a mocked HTTP transport (no API key or network needed)."""

import io
import json
import wave

import httpx
import pytest

from app.config import Settings
from app.speech.base import AudioInputError, SpeechProviderError, Transcription
from app.speech.sarvam_stt import FallbackSTT, SarvamSTT


def wav(seconds: float) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x10\x00" * int(16000 * seconds))
    return buffer.getvalue()


def adapter(handler):
    settings = Settings(stt_provider="sarvam", sarvam_api_key="test-key")
    return SarvamSTT(settings, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_sends_language_model_and_keyterms_and_maps_the_result():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers["api-subscription-key"]
        body = request.content.decode("utf-8", errors="ignore")
        seen["body"] = body
        return httpx.Response(200, json={"transcript": "गणेशगुड़ी, वार्ड पाँच", "language_code": "hi-IN", "request_id": "r1"})

    result = adapter(handler).transcribe(wav(1.5), "hi", ["गणेशगुड़ी", "Beltola"])
    assert seen["key"] == "test-key"
    assert 'name="model"\r\n\r\nsaaras:v4' in seen["body"]
    assert 'name="language_code"\r\n\r\nhi-IN' in seen["body"]
    assert json.dumps(["गणेशगुड़ी", "Beltola"], ensure_ascii=False) in seen["body"]
    assert result.text == "गणेशगुड़ी, वार्ड पाँच"
    assert result.language == "hi"
    assert result.confidence is None, "no invented confidence"
    assert result.engine == "sarvam-saaras:v4"


def test_auto_detects_when_no_language_and_maps_bengali_script_to_assamese():
    def handler(request: httpx.Request) -> httpx.Response:
        assert 'name="language_code"\r\n\r\nunknown' in request.content.decode("utf-8", "ignore")
        return httpx.Response(200, json={"transcript": "অসমীয়া", "language_code": "bn-IN"})

    assert adapter(handler).transcribe(wav(1.0), None).language == "as"


def test_empty_transcript_is_no_speech():
    result = adapter(lambda r: httpx.Response(200, json={"transcript": "", "language_code": None})).transcribe(
        wav(1.0), "en"
    )
    assert result.no_speech


def test_rejects_audio_over_30_seconds_without_calling_the_api():
    def handler(request):  # pragma: no cover - must not be called
        raise AssertionError("API called")

    with pytest.raises(AudioInputError):
        adapter(handler).transcribe(wav(31), "hi")


@pytest.mark.parametrize("status", [402, 403, 429, 500, 503])
def test_provider_failures_raise_provider_error(status):
    with pytest.raises(SpeechProviderError):
        adapter(lambda r: httpx.Response(status, json={"error": {"code": "x"}})).transcribe(wav(1.0), "hi")


def test_unreadable_audio_is_an_input_error():
    with pytest.raises(AudioInputError):
        adapter(lambda r: httpx.Response(400, json={"error": {"code": "invalid_request_error"}})).transcribe(
            wav(1.0), "hi"
        )


def test_network_failure_falls_back_to_the_local_engine():
    def handler(request):
        raise httpx.ConnectError("offline")

    class Local:
        name = "local"

        def transcribe(self, audio, hint, keyterms=None):
            return Transcription("local text", "hi", 0.8, 1.0, False, "local")

        def load(self):
            pass

    result = FallbackSTT(adapter(handler), Local()).transcribe(wav(1.0), "hi")
    assert result.text == "local text"
    assert result.engine == "local"


def test_api_key_is_required():
    with pytest.raises(ValueError):
        SarvamSTT(Settings(stt_provider="sarvam", sarvam_api_key=""))
