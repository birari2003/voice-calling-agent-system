"""NagarSeva local AI speech service.

Provides transcription and speech synthesis only. It has no database access and never decides
anything about complaints; the Node backend owns sessions and complaint creation. Audio is
processed in memory and never written to disk.
"""

import hmac
import json
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field

from .config import SUPPORTED_LANGUAGES, Settings, get_settings
from .speech.base import AudioInputError, SpeechProviderError, SpeechToText, TextToSpeech
from .speech.mms_tts import MmsTTS
from .speech.elevenlabs import ElevenLabsSTT, ElevenLabsTTS, FallbackTTS
from .speech.sarvam_stt import FallbackSTT, SarvamSTT
from .speech.whisper_stt import FasterWhisperSTT

logger = logging.getLogger("nagarseva.ai")

_stt: Optional[SpeechToText] = None
_tts: Optional[TextToSpeech] = None


def build_stt(settings: Settings) -> SpeechToText:
    local = FasterWhisperSTT(settings)
    if settings.stt_provider == "whisper":
        return local
    if settings.stt_provider == "sarvam":
        cloud = SarvamSTT(settings)
    elif settings.stt_provider == "elevenlabs":
        cloud = ElevenLabsSTT(settings)
    else:
        raise ValueError("STT_PROVIDER must be 'whisper', 'elevenlabs' or 'sarvam'.")
    return FallbackSTT(cloud, local) if settings.stt_fallback_to_local else cloud


def build_tts(settings: Settings) -> TextToSpeech:
    local = MmsTTS(settings)
    if settings.tts_provider == "mms":
        return local
    if settings.tts_provider != "elevenlabs":
        raise ValueError("TTS_PROVIDER must be 'mms' or 'elevenlabs'.")
    cloud = ElevenLabsTTS(settings)
    return FallbackTTS(cloud, local) if settings.tts_fallback_to_local else cloud


def get_stt() -> SpeechToText:
    global _stt
    if _stt is None:
        _stt = build_stt(get_settings())
    return _stt


def get_tts() -> TextToSpeech:
    global _tts
    if _tts is None:
        _tts = build_tts(get_settings())
    return _tts


def require_token(
    settings: Annotated[Settings, Depends(get_settings)],
    token: Annotated[Optional[str], Header(alias="X-AI-Service-Token")] = None,
) -> None:
    if settings.ai_service_token and not hmac.compare_digest(
        token or "", settings.ai_service_token
    ):
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORIZED", "message": "Invalid service token."})


def error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if get_settings().preload_models:
        logger.info("Preloading speech models")
        get_stt().load()
        for language in SUPPORTED_LANGUAGES:
            get_tts().load(language)
    yield


app = FastAPI(title="NagarSeva AI speech service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health(
    stt: Annotated[SpeechToText, Depends(get_stt)],
    tts: Annotated[TextToSpeech, Depends(get_tts)],
) -> dict:
    return {
        "status": "ok",
        "speechToText": {
            "engine": stt.name,
            "loaded": stt.is_loaded(),
            # Last cloud failure (e.g. a key without the right permission); null when healthy.
            "lastProviderError": getattr(stt, "last_provider_error", None),
        },
        "textToSpeech": {
            "engine": tts.name,
            "loadedLanguages": tts.loaded_languages(),
            "lastProviderError": getattr(tts, "last_provider_error", None),
        },
        "supportedLanguages": list(SUPPORTED_LANGUAGES),
        "audioRetention": "none",
    }


@app.post("/v1/transcribe", dependencies=[Depends(require_token)])
async def transcribe(
    audio: Annotated[UploadFile, File()],
    settings: Annotated[Settings, Depends(get_settings)],
    stt: Annotated[SpeechToText, Depends(get_stt)],
    language: Annotated[Optional[str], Form()] = None,
    keyterms: Annotated[Optional[str], Form()] = None,
) -> dict:
    if language is not None and language not in SUPPORTED_LANGUAGES:
        raise error(400, "UNSUPPORTED_LANGUAGE", "Language must be as, hi, or en.")
    terms = parse_keyterms(keyterms)
    data = await audio.read(settings.max_audio_bytes + 1)
    if len(data) > settings.max_audio_bytes:
        raise error(413, "AUDIO_TOO_LARGE", "The recording is too large.")
    if not data:
        raise error(400, "AUDIO_EMPTY", "No audio was received.")
    try:
        # Run the CPU-bound model call in a worker thread so the event loop stays responsive.
        from starlette.concurrency import run_in_threadpool

        result = await run_in_threadpool(stt.transcribe, data, language, terms)
    except AudioInputError as caught:
        raise error(422, "AUDIO_INVALID", str(caught)) from caught
    except SpeechProviderError as caught:
        logger.warning("speech provider failed: %s", caught)
        raise error(503, "PROVIDER_UNAVAILABLE", "The speech provider is unavailable.") from caught
    return {
        "text": result.text,
        "language": result.language,
        "confidence": result.confidence,
        "durationSeconds": result.duration_seconds,
        "noSpeech": result.no_speech,
        "engine": result.engine or stt.name,
    }


def parse_keyterms(raw: Optional[str]) -> Optional[list[str]]:
    """Optional JSON array of up to 50 short local words (e.g. locality names)."""
    if not raw:
        return None
    try:
        terms = json.loads(raw)
    except ValueError as caught:
        raise error(400, "INVALID_KEYTERMS", "keyterms must be a JSON array of strings.") from caught
    if not isinstance(terms, list) or not all(isinstance(term, str) for term in terms):
        raise error(400, "INVALID_KEYTERMS", "keyterms must be a JSON array of strings.")
    cleaned = [term.strip()[:64] for term in terms if term.strip()]
    return cleaned[:50] or None


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1)
    language: str


@app.post("/v1/synthesize", dependencies=[Depends(require_token)])
def synthesize(
    body: SynthesisRequest,
    settings: Annotated[Settings, Depends(get_settings)],
    tts: Annotated[TextToSpeech, Depends(get_tts)],
) -> Response:
    if body.language not in SUPPORTED_LANGUAGES:
        raise error(400, "UNSUPPORTED_LANGUAGE", "Language must be as, hi, or en.")
    if len(body.text) > settings.max_tts_characters:
        raise error(413, "TEXT_TOO_LONG", "The text is too long to synthesize.")
    try:
        speech = tts.synthesize(body.text, body.language)
    except SpeechProviderError as caught:
        logger.warning("voice provider failed: %s", caught)
        raise error(503, "PROVIDER_UNAVAILABLE", "The voice provider is unavailable.") from caught
    except ValueError as caught:
        raise error(422, "TEXT_NOT_SPEAKABLE", str(caught)) from caught
    return Response(
        content=speech.wav_bytes,
        media_type="audio/wav",
        headers={"X-Audio-Duration": str(speech.duration_seconds), "Cache-Control": "no-store"},
    )
