# NagarSeva AI speech service

Local Python (FastAPI) service that turns citizen speech into text and assistant replies into
speech. It has **no database access** and never decides anything about complaints. The Node
backend calls it, owns sessions, and creates complaints only after explicit confirmation.

Audio is processed in memory and never written to disk.

## Models (CPU)

| Component      | Model                                       | Licence          |
| -------------- | ------------------------------------------- | ---------------- |
| Speech-to-text | faster-whisper `small`, int8                | MIT              |
| Text-to-speech | Meta MMS-TTS: `mms-tts-asm`, `-hin`, `-eng` | **CC-BY-NC-4.0** |

- **MMS-TTS is non-commercial.** It is fine for local testing but must be replaced before
  production. AI4Bharat Indic-Parler-TTS (Apache-2.0) is the candidate.
- **Assamese speech recognition does not work with Whisper `small`.** In testing it returned
  text in another script at low confidence. The backend rejects such output and asks the
  citizen to repeat, so typed replies are the fallback. AI4Bharat IndicConformer is the
  candidate replacement for Assamese.
- English and Hindi sentences are recognised well. Very short replies ("yes", "हाँ") and place
  names are often misheard. Unreliable results are rejected by the backend, and the read-back
  step catches the rest.
- Models download on first use to `~/.cache/huggingface` (about 850 MB). With all models
  loaded the process uses about 2.2 GB of RAM.

Native Assamese and Hindi speakers must test recognition and pronunciation before any
real-citizen use.

## Cloud speech (ElevenLabs)

ElevenLabs can handle both directions: speech-to-text with Scribe (`scribe_v3`, Hindi/Assamese/
English, per-word confidence) and the assistant's voice (`eleven_v4_turbo`, Hindi and
Assamese). In `ai-service/.env`:

```
ELEVENLABS_API_KEY=<key>
STT_PROVIDER=elevenlabs
TTS_PROVIDER=elevenlabs
STT_FALLBACK_TO_LOCAL=true
TTS_FALLBACK_TO_LOCAL=true
ELEVENLABS_VOICE_ID=<voice ID from your Voice Library; an Indian voice sounds most natural>
```

- **The key must have the "Speech to Text" and "Text to Speech" permissions** (ElevenLabs →
  Developers → API keys → restrict key). A key without them gets HTTP 401 `missing_permissions`;
  the service then falls back to the local engines, and `/health` plus the call studio show
  the reason.
- While a location is being given, up to 50 of the organization's locality names are sent as
  key terms (ElevenLabs bills key terms at +20%). They are never sent for yes/no answers.
- **Privacy:** citizen audio and the assistant's text are sent to ElevenLabs; NagarSeva stores
  neither. ElevenLabs offers an India data-residency endpoint and zero-retention mode
  (enterprise). Get municipal approval before use with real citizens.

## Cloud speech-to-text (Sarvam AI)

On a CPU-only machine the local Whisper model is slow (about 3–9 s per Hindi answer) and often
mishears names and places. For fast, accurate Indian-language recognition, set in
`ai-service/.env`:

```
STT_PROVIDER=sarvam
SARVAM_API_KEY=<your key from dashboard.sarvam.ai>
STT_FALLBACK_TO_LOCAL=true
```

Then restart `npm run dev:ai`. Details:

- It uses Sarvam's `saaras:v4` model for Hindi (`hi-IN`), Assamese (`as-IN`) and English
  (`en-IN`). When the language isn't chosen yet, Sarvam auto-detects it.
- While the citizen gives a location, the backend sends up to 50 of the organization's own
  locality names as key terms, so local place names are recognised. Key terms are never sent
  for yes/no answers.
- Sarvam returns no confidence score, so cloud transcripts skip the confidence threshold. The
  script check, the garbled-text check and the read-back still apply.
- If Sarvam fails (no internet, quota exhausted, outage), the service falls back to local
  Whisper automatically. `/health` shows the engine in use.
- **Privacy:** citizen audio is sent to Sarvam AI for transcription (NagarSeva itself stores
  none). Obtain municipal approval and review Sarvam's data-retention terms before using it
  with real citizens. The studio tells staff when cloud transcription is active.
- Speech output (text-to-speech) is still local (MMS-TTS).

## Setup and run

From the repository root:

```bash
npm run setup:ai   # create ai-service/.venv and install CPU-only dependencies
npm run dev:ai     # serve on http://127.0.0.1:8001
npm run test:ai    # fast API tests (no models)
```

To run the slow round-trip tests through the real models:

```bash
cd ai-service && RUN_MODEL_TESTS=1 .venv/bin/python -m pytest -q -s tests/test_models.py
```

Configuration comes from environment variables or `ai-service/.env` (see `.env.example`).
Set the same `AI_SERVICE_TOKEN` here and in `backend/.env`. An empty token disables the
check, which is only acceptable while the service is bound to `127.0.0.1`. Set
`PRELOAD_MODELS=true` to load models at startup. Startup is then slower, but the first spoken
reply is no longer delayed by about 20 seconds.

## API

| Method | Path             | Purpose                                                                |
| ------ | ---------------- | ---------------------------------------------------------------------- |
| GET    | `/health`        | Engines and which models are loaded                                    |
| POST   | `/v1/transcribe` | Multipart `audio` (+ optional `language`: as/hi/en) → text, confidence |
| POST   | `/v1/synthesize` | JSON `{ text, language }` → `audio/wav`                                |

Both `/v1` endpoints require the `X-AI-Service-Token` header when a token is configured.
The speech engines sit behind the `SpeechToText` and `TextToSpeech` protocols in
`app/speech/base.py`, so they can be swapped without touching the HTTP layer or the backend.
