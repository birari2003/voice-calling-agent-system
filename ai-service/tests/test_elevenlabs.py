"""ElevenLabs adapter tests with a mocked HTTP transport (no key or network needed)."""

import io
import json
import math
import wave

import httpx
import pytest

from app.config import Settings
from app.speech.base import SpeechProviderError, SynthesizedSpeech, Transcription
from app.speech.elevenlabs import ElevenLabsSTT, ElevenLabsTTS, FallbackTTS, _clean_keyterms
from app.speech.sarvam_stt import FallbackSTT

SETTINGS = Settings(stt_provider="elevenlabs", tts_provider="elevenlabs", elevenlabs_api_key="test-key")
# The exact error ElevenLabs returns for a restricted key without the permission.
MISSING_PERMISSION = {
    "detail": {
        "type": "authentication_error",
        "code": "unauthorized",
        "message": "The API key you used is missing the permission speech_to_text to execute this operation.",
        "status": "missing_permissions",
    }
}


def wav(seconds: float) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(16000)
        out.writeframes(b"\x10\x00" * int(16000 * seconds))
    return buffer.getvalue()


def client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_stt_request_and_confidence_from_word_logprobs():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers["xi-api-key"]
        seen["body"] = request.content.decode("utf-8", "ignore")
        return httpx.Response(
            200,
            json={
                "text": "गणेशगुड़ी, वार्ड पाँच",
                "language_code": "hin",
                "words": [
                    {"text": "गणेशगुड़ी,", "type": "word", "logprob": math.log(0.9)},
                    {"text": " ", "type": "spacing", "logprob": 0},
                    {"text": "वार्ड", "type": "word", "logprob": math.log(0.8)},
                    {"text": "पाँच", "type": "word", "logprob": math.log(0.7)},
                ],
            },
        )

    result = ElevenLabsSTT(SETTINGS, client(handler)).transcribe(wav(1.5), "hi", ["गणेशगुड़ी", "Bad[term]"])
    assert seen["url"] == "https://api.elevenlabs.io/v1/speech-to-text"
    assert seen["key"] == "test-key"
    assert 'name="model_id"\r\n\r\nscribe_v3' in seen["body"]
    assert 'name="language_code"\r\n\r\nhin' in seen["body"]
    assert seen["body"].count('name="keyterms"') == 2
    assert "Bad term" in seen["body"], "forbidden characters removed from key terms"
    assert result.text == "गणेशगुड़ी, वार्ड पाँच"
    assert result.language == "hi"
    assert result.confidence == 0.8, "mean of word probabilities, spacing ignored"
    assert result.engine == "elevenlabs-scribe_v3"


def test_stt_auto_detect_maps_iso_639_3_codes():
    handler = lambda r: httpx.Response(200, json={"text": "অসমীয়া", "language_code": "asm", "words": []})
    result = ElevenLabsSTT(SETTINGS, client(handler)).transcribe(wav(1.0), None)
    assert result.language == "as"
    assert result.confidence is None, "no words, no invented confidence"


def test_keyterm_rules():
    assert _clean_keyterms(["Ganeshguri", "a b c d e f", "x" * 51, "  "]) == ["Ganeshguri"]
    assert len(_clean_keyterms([f"term{i}" for i in range(80)])) == 50


def test_missing_permission_falls_back_to_local_and_is_reported():
    handler = lambda r: httpx.Response(401, json=MISSING_PERMISSION)

    class Local:
        name = "local"

        def transcribe(self, audio, hint, keyterms=None):
            return Transcription("local text", "hi", 0.7, 1.0, False, "local")

    fallback = FallbackSTT(ElevenLabsSTT(SETTINGS, client(handler)), Local())
    result = fallback.transcribe(wav(1.0), "hi")
    assert result.engine == "local"
    assert "missing_permissions" in fallback.last_provider_error


def test_tts_request_and_fallback():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["json"] = json.loads(request.content)
        return httpx.Response(200, content=wav(1.0))

    speech = ElevenLabsTTS(SETTINGS, client(handler)).synthesize("आप किस समस्या की शिकायत करना चाहते हैं?", "hi")
    assert seen["url"].startswith("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb")
    assert "output_format=wav_16000" in seen["url"]
    assert seen["json"]["model_id"] == "eleven_v4_turbo"
    assert seen["json"]["language_code"] == "hi"
    assert speech.wav_bytes.startswith(b"RIFF")
    assert abs(speech.duration_seconds - 1.0) < 0.01

    class LocalVoice:
        name = "mms-tts"

        def synthesize(self, text, language):
            return SynthesizedSpeech(b"RIFFlocal", 16000, 0.5)

    failing = ElevenLabsTTS(SETTINGS, client(lambda r: httpx.Response(401, json=MISSING_PERMISSION)))
    fallback = FallbackTTS(failing, LocalVoice())
    assert fallback.synthesize("hello", "en").wav_bytes == b"RIFFlocal"
    assert fallback.last_provider_error


def test_tts_without_fallback_raises_provider_error():
    with pytest.raises(SpeechProviderError):
        ElevenLabsTTS(SETTINGS, client(lambda r: httpx.Response(500))).synthesize("hello", "en")


def test_api_key_required():
    with pytest.raises(ValueError):
        ElevenLabsSTT(Settings(elevenlabs_api_key=""))
