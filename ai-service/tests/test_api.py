"""Fast API tests with fake speech adapters (no model downloads)."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app, get_stt, get_tts
from app.speech.base import AudioInputError, SynthesizedSpeech, Transcription
from app.speech.mms_tts import prepare_text, split_sentences


class FakeSTT:
    name = "fake-stt"

    def __init__(self):
        self.calls = []

    def is_loaded(self):
        return True

    def load(self):
        pass

    def transcribe(self, audio, language_hint, keyterms=None):
        self.calls.append((audio, language_hint, keyterms))
        if audio == b"broken":
            raise AudioInputError("The audio could not be decoded.")
        return Transcription("hello there", language_hint or "en", 0.91, 1.5, False, "fake-stt")


class FakeTTS:
    name = "fake-tts"

    def loaded_languages(self):
        return ["en"]

    def load(self, language):
        pass

    def synthesize(self, text, language):
        if not text.strip("."):
            raise ValueError("The text has no pronounceable content.")
        return SynthesizedSpeech(b"RIFF....WAVE", 16000, 0.5)


@pytest.fixture
def client():
    stt = FakeSTT()
    app.dependency_overrides[get_stt] = lambda: stt
    app.dependency_overrides[get_tts] = lambda: FakeTTS()
    app.dependency_overrides[get_settings] = lambda: Settings(
        ai_service_token="secret-token", max_audio_bytes=1000, max_tts_characters=50
    )
    with TestClient(app) as test_client:
        test_client.stt = stt
        yield test_client
    app.dependency_overrides.clear()


AUTH = {"X-AI-Service-Token": "secret-token"}


def test_health_reports_engines_and_no_retention(client):
    body = client.get("/health").json()
    assert body["speechToText"]["engine"] == "fake-stt"
    assert body["audioRetention"] == "none"


def test_requires_service_token(client):
    response = client.post("/v1/transcribe", files={"audio": ("a.webm", b"abc")})
    assert response.status_code == 401
    response = client.post("/v1/synthesize", json={"text": "hi", "language": "en"})
    assert response.status_code == 401


def test_transcribe_passes_language_hint(client):
    response = client.post(
        "/v1/transcribe", headers=AUTH, files={"audio": ("a.webm", b"abc")}, data={"language": "hi"}
    )
    assert response.status_code == 200
    assert response.json()["confidence"] == 0.91
    assert client.stt.calls[-1] == (b"abc", "hi", None)


def test_transcribe_forwards_keyterms_and_validates_them(client):
    response = client.post(
        "/v1/transcribe",
        headers=AUTH,
        files={"audio": ("a.webm", b"abc")},
        data={"language": "hi", "keyterms": '["Beltola", " ", "Ganeshguri"]'},
    )
    assert response.status_code == 200
    assert client.stt.calls[-1][2] == ["Beltola", "Ganeshguri"]
    bad = client.post("/v1/transcribe", headers=AUTH, files={"audio": ("a.webm", b"abc")}, data={"keyterms": "{"})
    assert bad.status_code == 400


def test_transcribe_rejects_bad_input(client):
    unsupported = client.post(
        "/v1/transcribe", headers=AUTH, files={"audio": ("a.webm", b"abc")}, data={"language": "fr"}
    )
    assert unsupported.status_code == 400
    too_large = client.post("/v1/transcribe", headers=AUTH, files={"audio": ("a.webm", b"x" * 1001)})
    assert too_large.status_code == 413
    broken = client.post("/v1/transcribe", headers=AUTH, files={"audio": ("a.webm", b"broken")})
    assert broken.status_code == 422
    assert broken.json()["detail"]["code"] == "AUDIO_INVALID"


def test_synthesize_returns_wav_and_validates(client):
    response = client.post("/v1/synthesize", headers=AUTH, json={"text": "Hello", "language": "en"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert client.post("/v1/synthesize", headers=AUTH, json={"text": "x" * 51, "language": "en"}).status_code == 413
    assert client.post("/v1/synthesize", headers=AUTH, json={"text": "hi", "language": "fr"}).status_code == 400
    assert client.post("/v1/synthesize", headers=AUTH, json={"text": "...", "language": "en"}).status_code == 422


def test_digits_are_spelled_for_tts():
    assert prepare_text("Ticket NS-2026", "en") == "Ticket NS- two zero two six"
    assert prepare_text("वार्ड ५", "hi") == "वार्ड पाँच"
    assert split_sentences("One. Two? तीन। Four") == ["One.", "Two?", "तीन।", "Four"]
