"""ElevenLabs speech-to-text (Scribe) and text-to-speech.

Citizen audio and assistant text are sent to ElevenLabs; NagarSeva stores neither. Using it with
real citizens requires municipal approval (see docs/SECURITY_REVIEW.md). The API key needs the
"Speech to Text" and "Text to Speech" permissions.
"""

import logging
import math
import re
from typing import Optional

import httpx

from ..config import SUPPORTED_LANGUAGES, Settings
from .base import AudioInputError, SpeechProviderError, SynthesizedSpeech, Transcription
from .sarvam_stt import _audio_seconds

logger = logging.getLogger("nagarseva.ai.elevenlabs")
API = "https://api.elevenlabs.io/v1"

# Scribe accepts ISO-639-1 or ISO-639-3; the docs' language table uses ISO-639-3.
TO_SCRIBE = {"hi": "hin", "as": "asm", "en": "eng"}
# Detected languages sharing a script are mapped to the supported language with that script
# (only used to pick a conversation language and check the script).
FROM_SCRIBE = {
    "hin": "hi", "hi": "hi", "asm": "as", "as": "as", "eng": "en", "en": "en",
    "ben": "as", "bn": "as", "mar": "hi", "mr": "hi", "nep": "hi", "ne": "hi",
}
KEYTERM_FORBIDDEN = re.compile(r"[<>{}\[\]\\]")


def _clean_keyterms(keyterms: Optional[list[str]]) -> list[str]:
    """Scribe key terms: at most 50 characters and 5 words each, no <>{}[]\\ characters."""
    cleaned = []
    for term in keyterms or []:
        term = KEYTERM_FORBIDDEN.sub(" ", term).strip()
        if term and len(term) <= 50 and len(term.split()) <= 5:
            cleaned.append(term)
    return cleaned[:50]


def _provider_error(response: httpx.Response) -> SpeechProviderError:
    detail = ""
    try:
        body = response.json().get("detail")
        detail = body.get("status") or body.get("code") or "" if isinstance(body, dict) else ""
    except ValueError:
        pass
    return SpeechProviderError(f"ElevenLabs returned HTTP {response.status_code} {detail}".strip())


class ElevenLabsSTT:
    def __init__(self, settings: Settings, client: Optional[httpx.Client] = None) -> None:
        if not settings.elevenlabs_api_key:
            raise ValueError("ELEVENLABS_API_KEY is required for the ElevenLabs provider.")
        self._settings = settings
        self._client = client or httpx.Client(timeout=settings.elevenlabs_timeout_seconds)
        self.name = f"elevenlabs-{settings.elevenlabs_stt_model}"

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
        if duration > self._settings.max_audio_seconds:
            raise AudioInputError("The recording is too long.")
        fields: dict[str, object] = {
            "model_id": self._settings.elevenlabs_stt_model,
            "timestamps_granularity": "word",  # gives per-word log-probabilities
            "tag_audio_events": "false",
        }
        if language_hint in TO_SCRIBE:
            fields["language_code"] = TO_SCRIBE[language_hint]
        terms = _clean_keyterms(keyterms)
        if terms:
            fields["keyterms"] = terms  # a list becomes one repeated multipart field per term
        try:
            response = self._client.post(
                f"{API}/speech-to-text",
                headers={"xi-api-key": self._settings.elevenlabs_api_key},
                data=fields,
                files={"file": ("speech.webm", audio, "application/octet-stream")},
            )
        except httpx.HTTPError as error:
            raise SpeechProviderError(f"ElevenLabs request failed: {type(error).__name__}") from error
        if response.status_code == 400:
            raise AudioInputError("The speech provider could not read this audio.")
        if response.status_code != 200:
            raise _provider_error(response)
        body = response.json()
        text = (body.get("text") or "").strip()
        words = [w for w in body.get("words") or [] if w.get("type") == "word"]
        logprobs = [w["logprob"] for w in words if isinstance(w.get("logprob"), (int, float))]
        confidence = (
            round(sum(math.exp(value) for value in logprobs) / len(logprobs), 3) if logprobs else None
        )
        language = language_hint or FROM_SCRIBE.get((body.get("language_code") or "").lower()) or "en"
        if language not in SUPPORTED_LANGUAGES:
            language = "en"
        return Transcription(
            text=text,
            language=language,
            confidence=confidence,
            duration_seconds=round(duration, 2),
            no_speech=not text,
            engine=self.name,
        )


class ElevenLabsTTS:
    name = "elevenlabs-tts"

    def __init__(self, settings: Settings, client: Optional[httpx.Client] = None) -> None:
        if not settings.elevenlabs_api_key:
            raise ValueError("ELEVENLABS_API_KEY is required for the ElevenLabs provider.")
        self._settings = settings
        self._client = client or httpx.Client(timeout=settings.elevenlabs_timeout_seconds)
        self.name = f"elevenlabs-{settings.elevenlabs_tts_model}"

    def loaded_languages(self) -> list[str]:
        return list(SUPPORTED_LANGUAGES)

    def load(self, language: str) -> None:
        return None

    def synthesize(self, text: str, language: str) -> SynthesizedSpeech:
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language: {language}")
        try:
            response = self._client.post(
                f"{API}/text-to-speech/{self._settings.elevenlabs_voice_id}",
                params={"output_format": "wav_16000"},
                headers={"xi-api-key": self._settings.elevenlabs_api_key},
                json={
                    "text": text,
                    "model_id": self._settings.elevenlabs_tts_model,
                    "language_code": language,
                    "apply_text_normalization": "auto",
                },
            )
        except httpx.HTTPError as error:
            raise SpeechProviderError(f"ElevenLabs request failed: {type(error).__name__}") from error
        if response.status_code != 200 or not response.content:
            raise _provider_error(response)
        audio = response.content
        # wav_16000 is 16-bit mono PCM at 16 kHz: 32,000 bytes per second after the header.
        return SynthesizedSpeech(audio, 16000, round(max(len(audio) - 44, 0) / 32000, 2))


class FallbackTTS:
    """Uses the primary (cloud) voice and falls back to the local one if the provider fails."""

    def __init__(self, primary, fallback) -> None:
        self._primary = primary
        self._fallback = fallback
        self.name = f"{primary.name} (fallback: {fallback.name})"
        self.last_provider_error: Optional[str] = None

    def loaded_languages(self) -> list[str]:
        return self._primary.loaded_languages()

    def load(self, language: str) -> None:
        self._fallback.load(language)

    def synthesize(self, text: str, language: str) -> SynthesizedSpeech:
        try:
            result = self._primary.synthesize(text, language)
            self.last_provider_error = None
            return result
        except SpeechProviderError as error:
            self.last_provider_error = str(error)
            logger.warning("primary voice provider failed, using local voice: %s", error)
            return self._fallback.synthesize(text, language)
