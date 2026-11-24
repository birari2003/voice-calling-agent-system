import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Filter,
  LoaderCircle,
  MessagesSquare,
  MicOff,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  formatDuration,
  languageLabels,
  outcomeLabels,
  sessionsApi,
  type SessionOutcome,
} from '../api/sessions';
import {
  CollectedPanel,
  ModeBadge,
  SessionStatusBadge,
  TranscriptView,
} from '../components/sessions/SessionParts';

const pageSize = 20;
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function SessionsPage() {
  const { user } = useAuth();
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);
  const canRun = user?.permissions.includes('sessions:run') ?? false;
  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (outcome === 'active') params.set('status', 'active');
    else if (outcome) params.set('outcome', outcome);
    return params.toString();
  }, [page, outcome]);
  const query = useQuery({
    queryKey: ['sessions', queryString],
    queryFn: () => sessionsApi.list(queryString),
  });
  const pages = Math.max(1, query.data?.pagination.pages ?? 1);

  return (
    <div className="complaints-page">
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">CONVERSATIONS</div>
          <h1>Sessions</h1>
          <p>Review AI complaint conversations, their outcomes, and transcripts.</p>
        </div>
        {canRun && (
          <Link className="primary-button" to="/studio">
            <MessagesSquare size={16} /> Open call studio
          </Link>
        )}
      </div>
      <section className="complaint-panel">
        <div className="complaint-toolbar">
          <label className="complaint-filter">
            <Filter size={14} />
            <select
              aria-label="Filter by outcome"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All sessions</option>
              <option value="active">In progress</option>
              {(Object.keys(outcomeLabels) as SessionOutcome[]).map((value) => (
                <option key={value} value={value}>
                  {outcomeLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="complaint-table-scroll">
          <table className="complaint-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Citizen</th>
                <th>Mode</th>
                <th>Language</th>
                <th>Duration</th>
                <th>Outcome</th>
                <th>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={7} className="complaint-table-state">
                    <LoaderCircle className="spin-icon" size={18} /> Loading sessions…
                  </td>
                </tr>
              )}
              {query.isError && (
                <tr>
                  <td colSpan={7} className="complaint-table-state error">
                    <AlertCircle size={18} />
                    {query.error instanceof Error
                      ? query.error.message
                      : 'Could not load sessions.'}
                  </td>
                </tr>
              )}
              {query.data && !query.data.data.length && (
                <tr>
                  <td colSpan={7} className="complaint-table-state">
                    <span className="complaint-empty-icon">
                      <MessagesSquare size={20} />
                    </span>
                    <strong>No sessions found</strong>
                    <small>
                      {canRun
                        ? 'Start a simulation in the AI call studio.'
                        : 'Sessions will appear here once staff run them.'}
                    </small>
                  </td>
                </tr>
              )}
              {query.data?.data.map((session) => (
                <tr key={session.id}>
                  <td>
                    <Link className="ticket-person" to={`/sessions/${session.id}`}>
                      <span>
                        <strong>{dateTime.format(new Date(session.startedAt))}</strong>
                        <small>by {session.starter?.name ?? 'staff'}</small>
                      </span>
                    </Link>
                  </td>
                  <td>{session.citizen?.fullName || session.citizen?.phone || 'Test identity'}</td>
                  <td>
                    <ModeBadge session={session} />
                  </td>
                  <td>{session.language ? languageLabels[session.language] : '—'}</td>
                  <td>{formatDuration(session.durationSeconds)}</td>
                  <td>
                    <SessionStatusBadge session={session} />
                  </td>
                  <td>
                    {session.complaint ? (
                      <Link to={`/complaints/${session.complaint.id}`}>
                        {session.complaint.ticketId}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="complaint-pagination">
          <span>{query.data?.pagination.total ?? 0} sessions</span>
          <div>
            <button
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              aria-label="Next page"
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function SessionDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['session', id], queryFn: () => sessionsApi.get(id) });
  const canRun = user?.permissions.includes('sessions:run') ?? false;

  if (query.isLoading)
    return (
      <div className="complaint-detail-state">
        <LoaderCircle className="spin-icon" size={18} /> Loading session…
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="complaint-detail-state">
        <AlertCircle size={18} />
        {query.error instanceof Error ? query.error.message : 'Could not load this session.'}
        <Link to="/sessions">Back to sessions</Link>
      </div>
    );

  const session = query.data.data;
  return (
    <div className="complaints-page">
      <Link className="session-back" to="/sessions">
        <ArrowLeft size={15} /> All sessions
      </Link>
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">SESSION RECORD</div>
          <h1>{session.citizen?.fullName || session.citizen?.phone || 'Test identity'}</h1>
          <p>
            Started {dateTime.format(new Date(session.startedAt))} by{' '}
            {session.starter?.name ?? 'staff'} · Duration {formatDuration(session.durationSeconds)}
          </p>
        </div>
        <div className="session-heading-badges">
          <ModeBadge session={session} />
          <SessionStatusBadge session={session} />
        </div>
      </div>
      {session.status === 'active' && canRun && (
        <div className="simulation-banner" role="note">
          This session is still in progress.{' '}
          <Link to={`/studio?session=${session.id}`}>Continue it in the call studio</Link>.
        </div>
      )}
      <div className="studio-layout">
        <section className="complaint-panel studio-conversation" aria-label="Transcript">
          <header className="studio-panel-header">
            <strong>Transcript</strong>
            <span className="studio-muted">{session.messages.length} messages</span>
          </header>
          <div className="studio-transcript tall">
            <TranscriptView messages={session.messages} />
          </div>
        </section>
        <aside className="complaint-panel studio-side" aria-label="Session details">
          <header className="studio-panel-header">
            <strong>Collected details</strong>
          </header>
          <CollectedPanel collected={session.collected} session={session} />
          <p className="session-recording-note">
            <MicOff size={14} />
            {session.hasRecording
              ? 'A recording exists for this session.'
              : 'No audio recording exists for this session.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
