"""Speech-to-text through Sarvam AI's REST API (model saaras:v4).

Supports Hindi, Assamese, English and the other scheduled Indian languages. Audio is sent to
Sarvam for transcription and not stored by NagarSeva. Using it requires municipal approval for
sending citizen audio to a third party (see docs/SECURITY_REVIEW.md).
"""

import io
import json
import logging
from typing import Optional

import httpx

from ..config import SUPPORTED_LANGUAGES, Settings
from .base import AudioInputError, SpeechProviderError, Transcription

logger = logging.getLogger("nagarseva.ai.sarvam")
SARVAM_URL = "https://api.sarvam.ai/speech-to-text"
MAX_SECONDS = 30.0  # Sarvam's synchronous REST limit

TO_SARVAM = {"hi": "hi-IN", "as": "as-IN", "en": "en-IN"}
# Sarvam may detect a related language that shares a script. For our purposes (choosing a
# conversation language and checking the script) map it to the supported language with the
# same script: Bengali script -> Assamese, Devanagari -> Hindi.
FROM_SARVAM = {
    "hi-IN": "hi",
    "as-IN": "as",
    "en-IN": "en",
    "bn-IN": "as",
    "mr-IN": "hi",
    "ne-IN": "hi",
    "mai-IN": "hi",
    "doi-IN": "hi",
    "kok-IN": "hi",
    "sa-IN": "hi",
}


def _audio_seconds(audio: bytes) -> float:
    from faster_whisper import decode_audio

    try:
        return len(decode_audio(io.BytesIO(audio), sampling_rate=16000)) / 16000
    except Exception as error:  # PyAV raises several container/codec error types
        raise AudioInputError("The audio could not be decoded.") from error


class SarvamSTT:
    def __init__(self, settings: Settings, client: Optional[httpx.Client] = None) -> None:
        if not settings.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY is required when STT_PROVIDER=sarvam.")
        self._settings = settings
        self._client = client or httpx.Client(timeout=settings.sarvam_timeout_seconds)
        self.name = f"sarvam-{settings.sarvam_model}"

    def is_loaded(self) -> bool:
        return True

    def load(self) -> None:
        return None

    def transcribe(
        self,
        audio: bytes,
        language_hint: Optional[str],
        keyterms: Optional[list[str]] = None,
    ) -> Transcription:
        duration = _audio_seconds(audio)
        if duration < 0.2:
            raise AudioInputError("The recording is too short.")
        if duration > MAX_SECONDS:
            raise AudioInputError("Recordings must be 30 seconds or shorter.")
        data = {
            "model": self._settings.sarvam_model,
            "mode": "transcribe",
            "language_code": TO_SARVAM.get(language_hint or "", "unknown"),
        }
        if keyterms and self._settings.sarvam_model == "saaras:v4":
            data["keyterms"] = json.dumps(keyterms[:50], ensure_ascii=False)
        try:
            response = self._client.post(
                SARVAM_URL,
                headers={"api-subscription-key": self._settings.sarvam_api_key},
                data=data,
                files={"file": ("speech.webm", audio, "application/octet-stream")},
            )
        except httpx.HTTPError as error:
            raise SpeechProviderError(f"Sarvam request failed: {type(error).__name__}") from error
        if response.status_code == 400:
            raise AudioInputError("The speech provider could not read this audio.")
        if response.status_code != 200:
            code = (response.json().get("error", {}) or {}).get("code", "") if response.headers.get(
                "content-type", ""
            ).startswith("application/json") else ""
            raise SpeechProviderError(f"Sarvam returned HTTP {response.status_code} {code}".strip())
        body = response.json()
        text = (body.get("transcript") or "").strip()
        detected = FROM_SARVAM.get(body.get("language_code") or "")
        language = language_hint or detected or "en"
        if language not in SUPPORTED_LANGUAGES:
            language = "en"
        return Transcription(
            text=text,
            language=language,
            confidence=None,  # Sarvam returns no per-transcript confidence; do not invent one.
            duration_seconds=round(duration, 2),
            no_speech=not text,
            engine=self.name,
        )


class FallbackSTT:
    """Uses the primary (cloud) engine and falls back to the local one if the provider fails."""

    def __init__(self, primary, fallback) -> None:
        self._primary = primary
        self._fallback = fallback
        self.name = f"{primary.name} (fallback: {fallback.name})"
        self.last_provider_error: Optional[str] = None

    def is_loaded(self) -> bool:
        return True

    def load(self) -> None:
        self._fallback.load()

    def transcribe(self, audio, language_hint, keyterms=None) -> Transcription:
        try:
            result = self._primary.transcribe(audio, language_hint, keyterms)
            self.last_provider_error = None
            return result
        except SpeechProviderError as error:
            self.last_provider_error = str(error)
            logger.warning("primary speech provider failed, using local engine: %s", error)
            return self._fallback.transcribe(audio, language_hint, keyterms)
