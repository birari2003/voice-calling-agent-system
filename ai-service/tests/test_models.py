"""Round trip through the real models: synthesize speech, then transcribe it.

Slow and needs model downloads, so it only runs with RUN_MODEL_TESTS=1. A machine round trip
is a smoke test only; it does not replace testing with native Assamese and Hindi speakers.
"""

import os

import pytest

from app.config import Settings
from app.speech.mms_tts import MmsTTS
from app.speech.whisper_stt import FasterWhisperSTT

pytestmark = pytest.mark.skipif(os.environ.get("RUN_MODEL_TESTS") != "1", reason="set RUN_MODEL_TESTS=1")

settings = Settings()
tts = MmsTTS(settings)
stt = FasterWhisperSTT(settings)


def test_english_round_trip():
    speech = tts.synthesize("The garbage has not been collected for five days.", "en")
    result = stt.transcribe(speech.wav_bytes, "en")
    assert "garbage" in result.text.lower()
    assert result.confidence > 0.3


@pytest.mark.parametrize("language,text", [
    ("hi", "हमारी गली में दो दिन से पानी नहीं आ रहा है।"),
    ("as", "আমাৰ ৰাস্তাৰ লাইট তিনিদিন ধৰি জ্বলা নাই।"),
])
def test_indic_synthesis_and_transcription_run(language, text):
    speech = tts.synthesize(text, language)
    assert speech.duration_seconds > 1
    result = stt.transcribe(speech.wav_bytes, language)
    print(f"\n[{language}] confidence={result.confidence} text={result.text!r}")
    assert result.text


def test_silence_is_reported_as_no_speech():
    import io
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(b"\x00\x00" * 16000 * 2)
    result = stt.transcribe(buffer.getvalue(), "en")
    assert result.no_speech
