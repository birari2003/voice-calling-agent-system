from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_LANGUAGES = ("as", "hi", "en")


class Settings(BaseSettings):
    """Service settings, read from environment variables or ai-service/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Shared secret the Node backend sends in X-AI-Service-Token. Empty disables the check,
    # which is only acceptable while the service is bound to 127.0.0.1.
    ai_service_token: str = ""

    # Speech-to-text: "whisper" (local, private, slower on CPU), "elevenlabs" or "sarvam"
    # (cloud: fast and accurate; sends citizen audio to the provider). See ai-service/README.md.
    stt_provider: str = "whisper"
    # Text-to-speech: "mms" (local, non-commercial licence) or "elevenlabs" (cloud).
    tts_provider: str = "mms"
    # When a cloud voice fails, speak with the local voice instead.
    tts_fallback_to_local: bool = True
    elevenlabs_api_key: str = ""
    elevenlabs_stt_model: str = "scribe_v3"
    elevenlabs_tts_model: str = "eleven_v4_turbo"
    # Any voice from your ElevenLabs Voice Library; multilingual models speak Hindi/Assamese
    # with any voice, but an Indian voice sounds most natural.
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    elevenlabs_timeout_seconds: float = 15.0
    sarvam_api_key: str = ""
    sarvam_model: str = "saaras:v4"
    sarvam_timeout_seconds: float = 15.0
    # When the cloud provider fails (network, quota, outage), transcribe locally instead.
    stt_fallback_to_local: bool = True

    whisper_model: str = "small"
    whisper_compute_type: str = "int8"
    whisper_cpu_threads: int = 4
    whisper_beam_size: int = 1

    tts_model_as: str = "facebook/mms-tts-asm"
    tts_model_hi: str = "facebook/mms-tts-hin"
    tts_model_en: str = "facebook/mms-tts-eng"
    torch_threads: int = 4

    max_audio_bytes: int = 5 * 1024 * 1024
    max_audio_seconds: float = 60.0
    max_tts_characters: int = 800
    preload_models: bool = False

    def tts_model_for(self, language: str) -> str:
        return {"as": self.tts_model_as, "hi": self.tts_model_hi, "en": self.tts_model_en}[language]


@lru_cache
def get_settings() -> Settings:
    return Settings()
