"""Speech-to-text with faster-whisper on CPU.

Whisper's Assamese accuracy is limited; results must be validated with native speakers before
any real-citizen use. AI4Bharat IndicConformer is the candidate replacement behind the same
SpeechToText protocol.
"""

import io
import math
import threading
from typing import Optional

from ..config import SUPPORTED_LANGUAGES, Settings
from .base import AudioInputError, Transcription

SAMPLE_RATE = 16000


class FasterWhisperSTT:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None
        self._lock = threading.Lock()
        self.name = f"faster-whisper-{settings.whisper_model}-{settings.whisper_compute_type}"

    def is_loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        with self._lock:
            self._get_model()

    def _get_model(self):
        # Loaded lazily (and under the lock) so the service starts fast and memory is only
        # used once speech is actually needed.
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self._settings.whisper_model,
                device="cpu",
                compute_type=self._settings.whisper_compute_type,
                cpu_threads=self._settings.whisper_cpu_threads,
            )
        return self._model

    def _decode(self, audio: bytes):
        from faster_whisper import decode_audio

        try:
            samples = decode_audio(io.BytesIO(audio), sampling_rate=SAMPLE_RATE)
        except Exception as error:  # PyAV raises several container/codec error types
            raise AudioInputError("The audio could not be decoded.") from error
        duration = len(samples) / SAMPLE_RATE
        if duration < 0.2:
            raise AudioInputError("The recording is too short.")
        if duration > self._settings.max_audio_seconds:
            raise AudioInputError(
                f"Recordings must be {int(self._settings.max_audio_seconds)} seconds or shorter."
            )
        return samples, duration

    def transcribe(
        self,
        audio: bytes,
        language_hint: Optional[str],
        keyterms: Optional[list[str]] = None,
    ) -> Transcription:
        # keyterms are not used: biasing Whisper with expected words was observed to change
        # answers (see options below), so this engine ignores them.
        samples, duration = self._decode(audio)
        # No initial_prompt: biasing towards expected words (e.g. "yes/no") was observed to flip
        # answers. Fallback temperatures and output length are capped because very short clips
        # otherwise trigger long retry loops and repetitive hallucinations on CPU.
        options = dict(
            beam_size=self._settings.whisper_beam_size,
            vad_filter=True,
            condition_on_previous_text=False,
            temperature=(0.0, 0.4),
            # Hindi and Assamese need several tokens per word; 96 cut long sentences short.
            # Repetition loops are still caught by the backend's hallucination check.
            max_new_tokens=224,
        )
        with self._lock:
            model = self._get_model()
            segments, info = model.transcribe(samples, language=language_hint, **options)
            language = info.language
            if language_hint is None and language not in SUPPORTED_LANGUAGES:
                # Restrict auto-detection to the supported languages. Segments are lazy, so
                # discarding the first generator costs only the detection pass.
                probabilities = dict(info.all_language_probs or [])
                language = max(SUPPORTED_LANGUAGES, key=lambda code: probabilities.get(code, 0.0))
                segments, info = model.transcribe(samples, language=language, **options)
            segment_list = list(segments)

        text = " ".join(segment.text.strip() for segment in segment_list).strip()
        if not segment_list or not text:
            return Transcription("", language, 0.0, round(duration, 2), True, self.name)
        total = sum(max(segment.end - segment.start, 0.01) for segment in segment_list)
        confidence = sum(
            math.exp(segment.avg_logprob)
            * (1.0 - segment.no_speech_prob)
            * max(segment.end - segment.start, 0.01)
            for segment in segment_list
        ) / total
        return Transcription(
            text=text,
            language=language,
            confidence=round(min(max(confidence, 0.0), 1.0), 3),
            duration_seconds=round(duration, 2),
            no_speech=False,
            engine=self.name,
        )
