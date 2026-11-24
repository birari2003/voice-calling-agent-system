import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Info, Mic, UserRound, Volume2 } from 'lucide-react';
import {
  languageLabels,
  outcomeLabels,
  stepLabels,
  type CollectedFields,
  type SessionDetail,
  type SessionMessage,
  type SessionSummary,
} from '../../api/sessions';

const speakerLabels = { citizen: 'Citizen', assistant: 'NagarSeva AI', system: 'System' } as const;

export function TranscriptView({
  messages,
  pendingText,
  onPlay,
}: {
  messages: SessionMessage[];
  pendingText?: string;
  /** When set, assistant messages get a button to hear them spoken. */
  onPlay?: (messageId: number) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, pendingText]);

  if (!messages.length) return <p className="transcript-empty">No messages yet.</p>;
  return (
    <ol className="transcript" aria-label="Conversation transcript">
      {messages.map((message) => (
        <li key={message.id} className={`transcript-message ${message.speaker}`}>
          <span className="transcript-avatar" aria-hidden="true">
            {message.speaker === 'citizen' ? (
              <UserRound size={14} />
            ) : message.speaker === 'assistant' ? (
              <Bot size={14} />
            ) : (
              <Info size={14} />
            )}
          </span>
          <div className="transcript-bubble">
            <div className="transcript-meta">
              <strong>{speakerLabels[message.speaker]}</strong>
              <span>{stepLabels[message.conversationState] ?? message.conversationState}</span>
              <time dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
              {message.speaker === 'citizen' && message.confidence !== null && (
                <span className="transcript-confidence" title="Speech recognition confidence">
                  <Mic size={11} /> {Math.round(Number(message.confidence) * 100)}%
                </span>
              )}
              {onPlay && message.speaker === 'assistant' && (
                <button
                  type="button"
                  className="transcript-play"
                  aria-label="Play this reply"
                  title="Play this reply"
                  onClick={() => onPlay(message.id)}
                >
                  <Volume2 size={13} />
                </button>
              )}
            </div>
            <p lang={message.language ?? undefined}>{message.messageText}</p>
          </div>
        </li>
      ))}
      {pendingText && (
        <li className="transcript-message citizen pending">
          <span className="transcript-avatar" aria-hidden="true">
            <UserRound size={14} />
          </span>
          <div className="transcript-bubble">
            <div className="transcript-meta">
              <strong>Citizen</strong>
              <span>Sending…</span>
            </div>
            <p>{pendingText}</p>
          </div>
        </li>
      )}
      <div ref={endRef} />
    </ol>
  );
}

/** Plain-language session status for the studio and session list. */
export function sessionStatus(session: SessionSummary): { label: string; tone: string } {
  if (session.status === 'ended' && session.outcome) {
    const tone =
      session.outcome === 'complaint_created'
        ? 'success'
        : session.outcome === 'handoff'
          ? 'warning'
          : 'neutral';
    return { label: outcomeLabels[session.outcome], tone };
  }
  if (session.conversationState === 'CREATE_COMPLAINT')
    return { label: 'Registration pending', tone: 'warning' };
  if (session.conversationState === 'AWAIT_CONFIRMATION')
    return { label: 'Waiting for confirmation', tone: 'info' };
  return { label: 'Waiting for citizen reply', tone: 'info' };
}

export function SessionStatusBadge({ session }: { session: SessionSummary }) {
  const { label, tone } = sessionStatus(session);
  return <span className={`session-badge ${tone}`}>{label}</span>;
}

export function ModeBadge({ session }: { session: SessionSummary }) {
  return (
    <span className="session-badge mode">
      {session.mode === 'simulation' ? 'Simulation' : 'Phone call'} · {session.channel}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="collected-field">
      <dt>{label}</dt>
      <dd className={value ? '' : 'missing'}>{value || 'Not collected yet'}</dd>
    </div>
  );
}

export function CollectedPanel({
  collected,
  session,
}: {
  collected: CollectedFields | null;
  session: SessionDetail;
}) {
  return (
    <dl className="collected-list">
      <Field
        label="Language"
        value={collected?.language ? languageLabels[collected.language] : null}
      />
      <Field label="Name" value={collected?.citizenName} />
      <Field label="Problem" value={collected?.issueText} />
      <Field label="Suggested category" value={collected?.categorySuggestion} />
      <Field label="Locality" value={collected?.locality} />
      <Field label="Ward" value={collected?.ward} />
      <Field label="Landmark" value={collected?.landmark} />
      <div className="collected-field">
        <dt>Citizen confirmation</dt>
        <dd className={session.confirmedAt ? 'confirmed' : 'missing'}>
          {session.confirmedAt
            ? `Confirmed at ${new Date(session.confirmedAt).toLocaleTimeString()}`
            : 'Not confirmed'}
        </dd>
      </div>
      {session.complaint && (
        <div className="collected-field">
          <dt>Ticket</dt>
          <dd>
            <Link to={`/complaints/${session.complaint.id}`}>{session.complaint.ticketId}</Link>
          </dd>
        </div>
      )}
    </dl>
  );
}
