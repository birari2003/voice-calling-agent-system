"""Stable contracts for speech components. The HTTP layer only depends on these protocols,
so faster-whisper or MMS can be replaced (e.g. by IndicConformer or Indic-Parler-TTS) later."""

from dataclasses import dataclass
from typing import Optional, Protocol


class AudioInputError(ValueError):
    """The uploaded audio could not be decoded or is outside the accepted limits."""


class SpeechProviderError(RuntimeError):
    """A remote speech provider failed (network, quota, outage). Safe to fall back locally."""


@dataclass(frozen=True)
class Transcription:
    text: str
    language: str
    # 0..1 heuristic from the recognizer, or None when the provider gives no score.
    # A hint, never proof of correctness.
    confidence: Optional[float]
    duration_seconds: float
    no_speech: bool
    # Which engine actually produced this result (differs from the primary after a fallback).
    engine: str = ""


@dataclass(frozen=True)
class SynthesizedSpeech:
    wav_bytes: bytes
    sample_rate: int
    duration_seconds: float


class SpeechToText(Protocol):
    name: str

    def is_loaded(self) -> bool: ...

    def load(self) -> None: ...

    def transcribe(
        self,
        audio: bytes,
        language_hint: Optional[str],
        keyterms: Optional[list[str]] = None,
    ) -> Transcription:
        """keyterms: local words (e.g. locality names) the engine should listen for; optional."""
        ...


class TextToSpeech(Protocol):
    name: str

    def loaded_languages(self) -> list[str]: ...

    def load(self, language: str) -> None: ...

    def synthesize(self, text: str, language: str) -> SynthesizedSpeech: ...
