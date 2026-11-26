import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ear,
  FlaskConical,
  LoaderCircle,
  MessageSquareText,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Send,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { campaignsApi } from '../api/campaigns';
import { useAuth } from '../auth/AuthContext';
import {
  languageLabels,
  sessionsApi,
  stepLabels,
  type Language,
  type SessionDetail,
  type Transcription,
} from '../api/sessions';
import {
  CollectedPanel,
  SessionStatusBadge,
  TranscriptView,
} from '../components/sessions/SessionParts';
import { useSpeechPlayback } from '../hooks/useSpeechPlayback';
import { useVoiceRecorder, type VoiceRecorder } from '../hooks/useVoiceRecorder';

interface CitizenOption {
  id: number;
  fullName: string | null;
  phone: string | null;
  preferredLanguage: Language;
  optedOut: boolean;
}

type Channel = 'text' | 'voice';

/** Buttons that fit the current question, so a "No" can never be sent as a location. */
function quickRepliesFor(
  state: string,
  hasLocality: boolean,
): Array<{ label: string; text: string }> {
  const stop = { label: 'Stop', text: 'stop' };
  if (state === 'AWAIT_CONFIRMATION')
    return [{ label: 'Yes', text: 'yes' }, { label: 'No', text: 'no' }, stop];
  if (state === 'ASK_CORRECTION_FIELD')
    return [
      { label: '1 · Problem', text: '1' },
      { label: '2 · Location', text: '2' },
      { label: '3 · Name', text: '3' },
      stop,
    ];
  if (state === 'CLARIFY_LOCATION' && hasLocality)
    return [{ label: 'Skip landmark', text: 'skip' }, stop];
  if (state === 'LANGUAGE_SELECTION')
    return [
      { label: 'অসমীয়া', text: '1' },
      { label: 'हिंदी', text: '2' },
      { label: 'English', text: '3' },
      stop,
    ];
  return [stop];
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CallStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  // Owned here so the microphone is released whenever the studio unmounts.
  const recorder = useVoiceRecorder();
  const [freshSessionId, setFreshSessionId] = useState<string | null>(null);

  return (
    <div className="studio-page">
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">SIMULATION</div>
          <h1>AI call studio</h1>
          <p>Run a test complaint conversation with the NagarSeva assistant by voice or text.</p>
        </div>
      </div>
      <div className="simulation-banner" role="note">
        <FlaskConical size={17} />
        <span>
          <strong>Simulation mode.</strong> No real phone call is placed, no WhatsApp message is
          sent, and no audio is stored. Complaints are created only after the citizen confirms the
          read-back.
        </span>
      </div>
      {sessionId ? (
        <ActiveSession
          key={sessionId}
          sessionId={sessionId}
          recorder={recorder}
          speakOpening={freshSessionId === sessionId}
          onReset={() => {
            recorder.release();
            setSearchParams({}, { replace: true });
          }}
          onNext={(id) => {
            setFreshSessionId(id);
            setSearchParams({ session: id }, { replace: true });
          }}
        />
      ) : (
        <StartSessionForm
          recorder={recorder}
          onStarted={(id) => {
            setFreshSessionId(id);
            setSearchParams({ session: id }, { replace: true });
          }}
        />
      )}
    </div>
  );
}

function StartSessionForm({
  recorder,
  onStarted,
}: {
  recorder: VoiceRecorder;
  onStarted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [citizenId, setCitizenId] = useState('');
  const [language, setLanguage] = useState<Language | ''>('');
  const [channel, setChannel] = useState<Channel>('voice');

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const health = useQuery({ queryKey: ['ai-health'], queryFn: sessionsApi.aiHealth });
  const voiceAvailable = health.data?.data.speechService.status === 'available';
  const speechEngine = health.data?.data.speechToText?.engine ?? '';
  const cloudSpeech = speechEngine.startsWith('elevenlabs');
  const providerError =
    health.data?.data.speechToText?.lastProviderError ??
    health.data?.data.textToSpeech?.lastProviderError ??
    null;
  useEffect(() => {
    if (health.data && !voiceAvailable) setChannel('text');
  }, [health.data, voiceAvailable]);

  const citizens = useQuery({
    queryKey: ['studio-citizens', search],
    queryFn: () => {
      const params = new URLSearchParams({
        status: 'active',
        limit: '50',
        sortBy: 'fullName',
        sortOrder: 'asc',
      });
      if (search) params.set('search', search);
      return apiRequest<{ data: CitizenOption[] }>(`/citizens?${params.toString()}`);
    },
  });
  const options = citizens.data?.data ?? [];
  const selected = options.find((citizen) => String(citizen.id) === citizenId);

  const start = useMutation({
    mutationFn: async () => {
      // Microphone permission is requested only when a voice session is started.
      if (channel === 'voice' && !(await recorder.enable()))
        throw new Error('Microphone unavailable');
      return sessionsApi.start(Number(citizenId), language || null, channel);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['session', result.data.id], result);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      onStarted(result.data.id);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (citizenId) start.mutate();
  };
  const startError =
    start.isError && recorder.status === 'error'
      ? recorder.error
      : start.isError
        ? errorText(start.error, 'Could not start the session.')
        : '';

  return (
    <form className="complaint-panel studio-setup" onSubmit={submit}>
      <h2>Start a test session</h2>
      <p className="studio-muted">
        Choose a test citizen. If their record has a name, the assistant will not ask for it again.
      </p>
      <div className="studio-setup-grid">
        <label className="complaint-field">
          Find citizen
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Name, phone, locality…"
          />
        </label>
        <label className="complaint-field">
          Citizen
          <select required value={citizenId} onChange={(event) => setCitizenId(event.target.value)}>
            <option value="">{citizens.isLoading ? 'Loading…' : 'Select a citizen'}</option>
            {options.map((citizen) => (
              <option key={citizen.id} value={citizen.id} disabled={citizen.optedOut}>
                {citizen.fullName ?? 'Unnamed citizen'}
                {citizen.phone ? ` · ${citizen.phone}` : ''}
                {citizen.optedOut ? ' (opted out)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="complaint-field">
          Conversation language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language | '')}
          >
            <option value="">Let the assistant ask</option>
            {(Object.keys(languageLabels) as Language[]).map((code) => (
              <option key={code} value={code}>
                {languageLabels[code]}
              </option>
            ))}
          </select>
        </label>
        <label className="complaint-field">
          Input
          <select value={channel} onChange={(event) => setChannel(event.target.value as Channel)}>
            <option value="voice" disabled={!voiceAvailable}>
              Voice (microphone){voiceAvailable ? '' : ' — speech service offline'}
            </option>
            <option value="text">Text only</option>
          </select>
        </label>
      </div>
      {voiceAvailable && cloudSpeech && (
        <p className="studio-muted">
          Voice is transcribed by a cloud service ({health.data?.data.speechToText?.engine}). Audio
          is sent to that provider for transcription and is not stored by NagarSeva.
        </p>
      )}
      {voiceAvailable && providerError && (
        <div className="form-error" role="alert">
          ElevenLabs is failing. Reason: {providerError}. Check the API key, permissions, quota, and
          network connection.
        </div>
      )}
      {health.data && !voiceAvailable && (
        <p className="studio-muted">
          Voice is not configured, so only text sessions are available. Set{' '}
          <code>ELEVENLABS_API_KEY</code> in <code>backend/.env</code> and restart the backend.
        </p>
      )}
      {selected && !language && (
        <p className="studio-muted">
          Record preference: {languageLabels[selected.preferredLanguage]}. The assistant will still
          ask the citizen to choose.
        </p>
      )}
      {citizens.isError && (
        <div className="form-error" role="alert">
          {errorText(citizens.error, 'Could not load citizens.')}
        </div>
      )}
      {!citizens.isLoading && !options.length && !citizens.isError && (
        <div className="empty-citizen-note">
          No active citizens match. <Link to="/citizens">Add a test citizen</Link> first.
        </div>
      )}
      {startError && (
        <div className="form-error" role="alert">
          {startError}
        </div>
      )}
      <button className="primary-button" disabled={!citizenId || start.isPending}>
        {start.isPending ? <LoaderCircle size={16} className="spin-icon" /> : <Play size={16} />}
        {start.isPending && channel === 'voice' && recorder.status === 'requesting'
          ? 'Waiting for microphone permission…'
          : 'Start simulation'}
      </button>
    </form>
  );
}

type VoiceState = 'listening' | 'processing' | 'speaking' | 'idle';

const voiceStateLabels: Record<VoiceState, string> = {
  listening: 'Listening',
  processing: 'Processing',
  speaking: 'Speaking',
  idle: 'Ready',
};

function HeardNote({ heard }: { heard: Transcription | 'silence' | null }) {
  if (!heard) return null;
  if (heard === 'silence' || heard.reason === 'no_speech')
    return (
      <p className="voice-heard warn">No speech was heard. Press Speak to try again, or type.</p>
    );
  // Cloud providers may return no confidence score; then none is shown.
  const score =
    heard.confidence === null ? '' : `${Math.round(heard.confidence * 100)}% confidence, `;
  if (!heard.accepted)
    return (
      <p className="voice-heard warn">
        Not clear enough{score ? ` (${score.replace(/, $/, '')})` : ''}: “{heard.text}”. The
        assistant asked the citizen to repeat. You can also type the reply.
      </p>
    );
  return (
    <p className="voice-heard">
      Heard ({score}
      {languageLabels[heard.language]}): “{heard.text}”
    </p>
  );
}

function ActiveSession({
  sessionId,
  recorder,
  speakOpening,
  onReset,
  onNext,
}: {
  sessionId: string;
  recorder: VoiceRecorder;
  speakOpening: boolean;
  onReset: () => void;
  /** Opens another session in the studio (used to move through a campaign queue). */
  onNext: (sessionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [speakReplies, setSpeakReplies] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [heard, setHeard] = useState<Transcription | 'silence' | null>(null);
  const playback = useSpeechPlayback(sessionId);
  const session = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionsApi.get(sessionId),
  });
  const data: SessionDetail | undefined = session.data?.data;
  const isVoice = data?.channel === 'voice';

  const updateCache = useCallback(
    (result: { data: SessionDetail }) => {
      queryClient.setQueryData(['session', sessionId], { data: result.data });
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      // A campaign session's outcome changes its recipient list and progress.
      if (result.data.campaign) {
        void queryClient.invalidateQueries({ queryKey: ['campaign', result.data.campaign.id] });
        void queryClient.invalidateQueries({
          queryKey: ['campaign-recipients', result.data.campaign.id],
        });
        void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      }
    },
    [queryClient, sessionId],
  );
  const turn = useMutation({
    mutationFn: (reply: string) => sessionsApi.turn(sessionId, reply),
    onSuccess: (result) => {
      updateCache(result);
      setText('');
      setHeard(null);
    },
  });
  const audioTurn = useMutation({
    mutationFn: (audio: Blob) => sessionsApi.audioTurn(sessionId, audio),
    onSuccess: (result) => {
      updateCache(result);
      setHeard(result.transcription);
    },
  });
  const action = useMutation({
    mutationFn: (name: 'confirm' | 'cancel' | 'complete') => sessionsApi.action(sessionId, name),
    onSuccess: (result) => {
      playback.stop();
      recorder.stopRecording();
      updateCache(result);
    },
  });
  const busy = turn.isPending || action.isPending || audioTurn.isPending;
  const { user } = useAuth();
  const canRunCampaign = user?.permissions.includes('campaigns:manage') ?? false;
  const nextRecipient = useMutation({
    mutationFn: () => campaignsApi.nextSession(data!.campaign!.id),
    onSuccess: (nextId) => {
      void queryClient.invalidateQueries({ queryKey: ['campaign', data?.campaign?.id] });
      if (nextId) onNext(nextId);
    },
  });

  // Latest values for callbacks that run after asynchronous playback finishes.
  const live = useRef({ acceptsInput: false, autoListen, busy });
  live.current = { acceptsInput: !!data?.acceptsInput, autoListen, busy };

  const listen = useCallback(async () => {
    if (!live.current.acceptsInput || live.current.busy || recorder.status !== 'ready') return;
    setHeard(null);
    playback.stop();
    const result = await recorder.record();
    if (!result.blob) {
      setHeard('silence');
      return;
    }
    if (live.current.acceptsInput) audioTurn.mutate(result.blob);
  }, [audioTurn, playback, recorder]);

  // Speak assistant messages that arrived since the last render, then listen again.
  const spokenUpTo = useRef<number | null>(null);
  useEffect(() => {
    if (!data || !isVoice) return;
    const assistantIds = data.messages
      .filter((message) => message.speaker === 'assistant')
      .map((message) => message.id);
    if (spokenUpTo.current === null)
      spokenUpTo.current = speakOpening ? 0 : Math.max(0, ...assistantIds);
    const fresh = assistantIds.filter((id) => id > spokenUpTo.current!);
    if (!fresh.length) return;
    spokenUpTo.current = Math.max(...fresh);
    if (!speakReplies) return;
    void playback.speak(fresh).then((finished) => {
      if (finished && live.current.autoListen && live.current.acceptsInput) void listen();
    });
    // Intentionally keyed on new messages only; toggle changes apply to the next reply.
  }, [data?.messages, isVoice]);

  // Release the microphone once the conversation is over and the last reply has been spoken.
  useEffect(() => {
    if (data?.status === 'ended' && !playback.speaking) recorder.release();
  }, [data?.status, playback.speaking, recorder]);

  if (session.isLoading)
    return (
      <div className="complaint-detail-state">
        <LoaderCircle className="spin-icon" size={18} /> Loading session…
      </div>
    );
  if (session.isError || !data)
    return (
      <div className="complaint-panel studio-setup">
        <div className="form-error" role="alert">
          {errorText(session.error, 'Could not load this session.')}
        </div>
        <button className="primary-button" onClick={onReset}>
          <RotateCcw size={16} /> Start a new session
        </button>
      </div>
    );

  const send = (reply: string) => {
    const trimmed = reply.trim();
    if (!trimmed || !data.acceptsInput || busy) return;
    playback.stop();
    recorder.stopRecording();
    turn.mutate(trimmed);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(text);
  };
  const error = turn.error ?? action.error ?? audioTurn.error;
  const voiceState: VoiceState =
    recorder.status === 'recording'
      ? 'listening'
      : audioTurn.isPending || turn.isPending
        ? 'processing'
        : playback.speaking
          ? 'speaking'
          : 'idle';
  const micReady = recorder.status === 'ready' || recorder.status === 'recording';

  return (
    <div className="studio-layout">
      <section className="complaint-panel studio-conversation" aria-label="Conversation">
        <header className="studio-panel-header">
          <span>
            <MessageSquareText size={16} />
            <strong>Conversation</strong>
          </span>
          <span className="studio-header-badges">
            {isVoice && data.status === 'active' && (
              <span className={`voice-state ${voiceState}`} aria-live="polite">
                <i /> {voiceStateLabels[voiceState]}
              </span>
            )}
            <SessionStatusBadge session={data} />
          </span>
        </header>
        {data.campaign && (
          <p className="studio-campaign-note">
            <span>
              Campaign: <Link to={`/campaigns/${data.campaign.id}`}>{data.campaign.name}</Link>
            </span>
            {data.status === 'ended' && canRunCampaign && data.campaign.status === 'running' && (
              <button
                className="primary-button"
                disabled={nextRecipient.isPending}
                onClick={() => nextRecipient.mutate()}
              >
                {nextRecipient.isPending ? (
                  <LoaderCircle size={14} className="spin-icon" />
                ) : (
                  <Play size={14} />
                )}
                Run next recipient
              </button>
            )}
            {nextRecipient.data === null && <span>No recipients are waiting.</span>}
          </p>
        )}
        <div className="studio-transcript" aria-live="polite">
          <TranscriptView
            messages={data.messages}
            pendingText={turn.isPending ? turn.variables : undefined}
            onPlay={isVoice ? (id) => void playback.speak([id]) : undefined}
          />
        </div>
        {error && (
          <div className="form-error studio-error" role="alert">
            <AlertCircle size={14} /> {errorText(error, 'Something went wrong.')}
          </div>
        )}
        {data.acceptsInput ? (
          <form className="studio-composer" onSubmit={submit}>
            {isVoice && (
              <div className="voice-controls">
                {micReady ? (
                  recorder.status === 'recording' ? (
                    <button
                      type="button"
                      className="voice-button recording"
                      onClick={recorder.stopRecording}
                    >
                      <Square size={15} /> Done speaking
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="voice-button"
                      disabled={busy}
                      onClick={() => void listen()}
                    >
                      {audioTurn.isPending ? (
                        <LoaderCircle size={15} className="spin-icon" />
                      ) : (
                        <Mic size={15} />
                      )}
                      {audioTurn.isPending ? 'Transcribing…' : 'Speak'}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="voice-button"
                    disabled={recorder.status === 'requesting'}
                    onClick={() => void recorder.enable()}
                  >
                    <MicOff size={15} /> Enable microphone
                  </button>
                )}
                <span
                  className="voice-level"
                  role="meter"
                  aria-label="Microphone level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(recorder.level * 100)}
                >
                  <i style={{ width: `${Math.round(recorder.level * 100)}%` }} />
                </span>
                {playback.speaking && (
                  <button type="button" className="text-link" onClick={playback.stop}>
                    Stop speaking
                  </button>
                )}
                <label className="voice-toggle">
                  <input
                    type="checkbox"
                    checked={speakReplies}
                    onChange={(event) => {
                      setSpeakReplies(event.target.checked);
                      if (!event.target.checked) playback.stop();
                    }}
                  />
                  {speakReplies ? <Volume2 size={13} /> : <VolumeX size={13} />} Speak replies
                </label>
                <label className="voice-toggle">
                  <input
                    type="checkbox"
                    checked={autoListen}
                    onChange={(event) => setAutoListen(event.target.checked)}
                  />
                  <Ear size={13} /> Listen after reply
                </label>
              </div>
            )}
            {isVoice && recorder.error && (
              <p className="voice-heard warn" role="alert">
                {recorder.error}
              </p>
            )}
            {isVoice && playback.error && (
              <p className="voice-heard warn" role="alert">
                {playback.error}
              </p>
            )}
            {isVoice && <HeardNote heard={heard} />}
            <div className="studio-quick-replies" aria-label="Quick replies">
              {quickRepliesFor(data.conversationState, !!data.collected?.locality).map((reply) => (
                <button
                  key={reply.label}
                  type="button"
                  disabled={busy}
                  onClick={() => send(reply.text)}
                >
                  {reply.label}
                </button>
              ))}
            </div>
            <div className="studio-input-row">
              <label className="sr-only" htmlFor="citizen-reply">
                Citizen reply
              </label>
              <input
                id="citizen-reply"
                autoFocus={!isVoice}
                maxLength={1000}
                value={text}
                disabled={busy}
                onChange={(event) => setText(event.target.value)}
                placeholder={
                  isVoice
                    ? 'Or type the citizen’s reply (text fallback)…'
                    : 'Type what the citizen says…'
                }
              />
              <button className="primary-button" disabled={busy || !text.trim()}>
                {turn.isPending ? (
                  <LoaderCircle size={15} className="spin-icon" />
                ) : (
                  <Send size={15} />
                )}
                Send
              </button>
            </div>
          </form>
        ) : (
          <div className="studio-ended">
            {data.status === 'ended'
              ? 'This session has ended.'
              : 'The assistant is not waiting for input.'}
            <button className="primary-button" onClick={onReset}>
              <RotateCcw size={15} /> New session
            </button>
          </div>
        )}
      </section>
      <aside className="complaint-panel studio-side" aria-label="Session details">
        <header className="studio-panel-header">
          <strong>Current step</strong>
          <span className="session-badge mode">{isVoice ? 'Voice' : 'Text'}</span>
        </header>
        <p className="studio-step">
          {stepLabels[data.conversationState] ?? data.conversationState}
        </p>
        <header className="studio-panel-header">
          <strong>Collected details</strong>
        </header>
        <CollectedPanel collected={data.collected} session={data} />
        {data.errorMessage && data.status === 'active' && (
          <div className="form-error" role="alert">
            {data.errorMessage}
          </div>
        )}
        <div className="studio-actions">
          {data.status === 'active' && data.conversationState === 'CREATE_COMPLAINT' && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => action.mutate('confirm')}
            >
              <RotateCcw size={15} /> Retry registration
            </button>
          )}
          {data.status === 'active' && data.conversationState !== 'CREATE_COMPLAINT' && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => action.mutate('complete')}
            >
              <Square size={14} /> End session
            </button>
          )}
          {data.status === 'active' && (
            <button
              className="secondary-button danger"
              disabled={busy}
              onClick={() => action.mutate('cancel')}
            >
              <X size={14} /> Cancel session
            </button>
          )}
          <Link className="secondary-button" to={`/sessions/${data.id}`}>
            Open session record
          </Link>
        </div>
      </aside>
    </div>
  );
}
