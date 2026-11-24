"""Text-to-speech with Meta MMS-TTS (VITS) on CPU.

LICENCE: MMS-TTS checkpoints are CC-BY-NC-4.0 (non-commercial). They are used here for local
testing only and must be replaced (for example by AI4Bharat Indic-Parler-TTS, Apache-2.0)
before production use. Assamese pronunciation must be reviewed by native speakers.
"""

import io
import re
import threading
import wave

from ..config import SUPPORTED_LANGUAGES, Settings
from .base import SynthesizedSpeech

# MMS vocabularies have no digits, so numbers (e.g. ticket IDs) are read digit by digit.
DIGIT_WORDS = {
    "en": ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
    "hi": ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ"],
    "as": ["শূন্য", "এক", "দুই", "তিনি", "চাৰি", "পাঁচ", "ছয়", "সাত", "আঠ", "ন"],
}
NATIVE_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯०१२३४५६७८९", "01234567890123456789")
SENTENCE_BREAK = re.compile(r"(?<=[.!?।])\s+")
PAUSE_SECONDS = 0.25


def prepare_text(text: str, language: str) -> str:
    words = DIGIT_WORDS[language]
    text = text.translate(NATIVE_DIGITS)
    text = re.sub(r"\d", lambda match: f" {words[int(match.group())]} ", text)
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(text: str) -> list[str]:
    return [part for part in SENTENCE_BREAK.split(text) if part.strip()]


class MmsTTS:
    name = "mms-tts"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._models: dict[str, tuple[object, object]] = {}
        self._lock = threading.Lock()
        self._uroman = None

    def loaded_languages(self) -> list[str]:
        return sorted(self._models)

    def load(self, language: str) -> None:
        with self._lock:
            self._load(language)

    def _load(self, language: str):
        if language not in self._models:
            import torch
            from transformers import AutoTokenizer, VitsModel

            torch.set_num_threads(self._settings.torch_threads)
            name = self._settings.tts_model_for(language)
            self._models[language] = (
                VitsModel.from_pretrained(name).eval(),
                AutoTokenizer.from_pretrained(name),
            )
        return self._models[language]

    def _romanize_if_needed(self, tokenizer, text: str) -> str:
        # Some MMS checkpoints are trained on romanized text and need uroman preprocessing.
        if not getattr(tokenizer, "is_uroman", False):
            return text
        if self._uroman is None:
            import uroman

            self._uroman = uroman.Uroman()
        return self._uroman.romanize_string(text)

    def synthesize(self, text: str, language: str) -> SynthesizedSpeech:
        if language not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language: {language}")
        import numpy as np
        import torch

        prepared = prepare_text(text, language)
        with self._lock:
            model, tokenizer = self._load(language)
            sample_rate = int(model.config.sampling_rate)
            pause = np.zeros(int(sample_rate * PAUSE_SECONDS), dtype=np.float32)
            pieces = []
            for sentence in split_sentences(prepared) or [prepared]:
                inputs = tokenizer(self._romanize_if_needed(tokenizer, sentence), return_tensors="pt")
                if inputs["input_ids"].shape[-1] == 0:
                    continue  # nothing pronounceable in this sentence
                with torch.no_grad():
                    waveform = model(**inputs).waveform[0].cpu().numpy()
                pieces.extend([waveform.astype(np.float32), pause])
        if not pieces:
            raise ValueError("The text has no pronounceable content.")
        audio = np.concatenate(pieces)
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(pcm.tobytes())
        return SynthesizedSpeech(buffer.getvalue(), sample_rate, round(len(audio) / sample_rate, 2))
