import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  ListChecks,
  LoaderCircle,
  Pause,
  Play,
  PlayCircle,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  campaignStatusLabels,
  campaignsApi,
  exclusionLabels,
  recipientStatusLabels,
  type Campaign,
  type CampaignInput,
  type CampaignStatus,
  type EligibilityPreview,
  type ExclusionReason,
  type RecipientStatus,
} from '../api/campaigns';
import { languageLabels, outcomeLabels, type Language } from '../api/sessions';

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const statusTone: Record<CampaignStatus, string> = {
  draft: 'neutral',
  ready: 'info',
  running: 'success',
  paused: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  failed: 'warning',
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function counts(campaign: Campaign) {
  const c = campaign.recipientCounts;
  const eligible = (c.pending ?? 0) + (c.in_progress ?? 0) + (c.completed ?? 0) + (c.failed ?? 0);
  const done = (c.completed ?? 0) + (c.failed ?? 0);
  const excluded = Object.values(campaign.exclusionCounts ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return { eligible, done, excluded, pending: c.pending ?? 0, inProgress: c.in_progress ?? 0 };
}

function SimulationNote() {
  return (
    <div className="simulation-banner" role="note">
      <FlaskConical size={17} />
      <span>
        <strong>Simulation campaigns.</strong> No phone numbers are called and no messages are sent.
        Each recipient is a test conversation you run in the AI call studio.
      </span>
    </div>
  );
}

export function CampaignsPage() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: ['campaigns', page],
    queryFn: () => campaignsApi.list(page),
  });
  const pages = Math.max(1, query.data?.pagination.pages ?? 1);

  return (
    <div className="complaints-page">
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">OUTREACH</div>
          <h1>Campaigns</h1>
          <p>Plan controlled batches of simulated complaint conversations.</p>
        </div>
        <button className="primary-button" onClick={() => setCreating(true)}>
          <Plus size={16} /> New campaign
        </button>
      </div>
      <SimulationNote />
      <section className="complaint-panel">
        <div className="complaint-table-scroll">
          <table className="complaint-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Input</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={5} className="complaint-table-state">
                    <LoaderCircle className="spin-icon" size={18} /> Loading campaigns…
                  </td>
                </tr>
              )}
              {query.isError && (
                <tr>
                  <td colSpan={5} className="complaint-table-state error">
                    <AlertCircle size={18} /> {errorText(query.error, 'Could not load campaigns.')}
                  </td>
                </tr>
              )}
              {query.data && !query.data.data.length && (
                <tr>
                  <td colSpan={5} className="complaint-table-state">
                    <span className="complaint-empty-icon">
                      <ListChecks size={20} />
                    </span>
                    <strong>No campaigns yet</strong>
                    <small>Create one to run a controlled batch of test conversations.</small>
                  </td>
                </tr>
              )}
              {query.data?.data.map((campaign) => {
                const { eligible, done } = counts(campaign);
                return (
                  <tr key={campaign.id}>
                    <td>
                      <Link className="ticket-person" to={`/campaigns/${campaign.id}`}>
                        <span>
                          <strong>{campaign.name}</strong>
                          <small>{campaign.description || 'No description'}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className={`session-badge ${statusTone[campaign.status]}`}>
                        {campaignStatusLabels[campaign.status]}
                      </span>
                    </td>
                    <td>{eligible ? `${done} of ${eligible} recipients` : 'Not previewed'}</td>
                    <td>{campaign.channel === 'voice' ? 'Voice' : 'Text'}</td>
                    <td>{dateTime.format(new Date(campaign.createdAt))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="complaint-pagination">
          <span>{query.data?.pagination.total ?? 0} campaigns</span>
          <div>
            <button
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              disabled={page >= pages}
              aria-label="Next page"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {creating && <CampaignEditor onClose={() => setCreating(false)} />}
    </div>
  );
}

function CampaignEditor({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [wards, setWards] = useState('');
  const [locality, setLocality] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<Language | ''>('');
  const [defaultLanguage, setDefaultLanguage] = useState<Language | ''>('');
  const [channel, setChannel] = useState<'text' | 'voice'>('text');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const create = useMutation({
    mutationFn: (input: CampaignInput) => campaignsApi.create(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate(`/campaigns/${result.data.id}`);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const wardList = wards
      .split(',')
      .map((ward) => ward.trim())
      .filter(Boolean);
    create.mutate({
      name: name.trim(),
      description: description.trim() || null,
      defaultLanguage: defaultLanguage || null,
      channel,
      maxAttempts,
      targetFilter: {
        ...(wardList.length ? { wards: wardList } : {}),
        ...(locality.trim() ? { locality: locality.trim() } : {}),
        ...(targetLanguage ? { language: targetLanguage } : {}),
      },
    });
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal complaint-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-editor-title"
        onSubmit={submit}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">SIMULATION</span>
            <h2 id="campaign-editor-title">New campaign</h2>
            <p>Choose who to include. Eligibility is checked in the next step.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body campaign-form">
          <label className="complaint-field">
            Name
            <input
              required
              minLength={3}
              maxLength={160}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Ward 7 sanitation check-in"
            />
          </label>
          <label className="complaint-field">
            Description (optional)
            <textarea
              maxLength={2000}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <fieldset className="campaign-fieldset">
            <legend>Target group (leave empty for all citizens)</legend>
            <div className="complaint-form-grid">
              <label className="complaint-field">
                Wards (comma separated)
                <input
                  value={wards}
                  onChange={(event) => setWards(event.target.value)}
                  placeholder="7, 12"
                />
              </label>
              <label className="complaint-field">
                Locality contains
                <input value={locality} onChange={(event) => setLocality(event.target.value)} />
              </label>
              <label className="complaint-field">
                Preferred language
                <select
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value as Language | '')}
                >
                  <option value="">Any</option>
                  {(Object.keys(languageLabels) as Language[]).map((code) => (
                    <option key={code} value={code}>
                      {languageLabels[code]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
          <div className="complaint-form-grid">
            <label className="complaint-field">
              Conversation language
              <select
                value={defaultLanguage}
                onChange={(event) => setDefaultLanguage(event.target.value as Language | '')}
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
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as 'text' | 'voice')}
              >
                <option value="text">Text</option>
                <option value="voice">Voice (microphone)</option>
              </select>
            </label>
            <label className="complaint-field">
              Attempts per citizen
              <select
                value={maxAttempts}
                onChange={(event) => setMaxAttempts(Number(event.target.value))}
              >
                <option value={1}>1 (recommended)</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          </div>
          <p className="studio-muted">
            Extra attempts are used only when staff abort a test before it reaches the citizen. A
            conversation the citizen ends or completes is never repeated.
          </p>
          {create.isError && (
            <div className="form-error" role="alert">
              {errorText(create.error, 'Could not create the campaign.')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" disabled={create.isPending}>
            {create.isPending && <LoaderCircle size={15} className="spin-icon" />} Create draft
          </button>
        </div>
      </form>
    </div>
  );
}

function PreviewResult({ preview }: { preview: EligibilityPreview }) {
  const reasons = Object.entries(preview.excluded) as Array<[ExclusionReason, number]>;
  return (
    <div className={`campaign-preview ${preview.exceedsLimit || !preview.eligible ? 'warn' : ''}`}>
      <strong>
        {preview.eligible} of {preview.matched} matching citizens are eligible.
      </strong>
      {preview.exceedsLimit && (
        <p>
          A simulation campaign can include at most {preview.maxRecipients} recipients. Narrow the
          target group.
        </p>
      )}
      {!preview.eligible && !preview.exceedsLimit && (
        <p>Nobody can be included. Adjust the target group or consent records.</p>
      )}
      {reasons.length > 0 && (
        <ul>
          {reasons.map(([reason, count]) => (
            <li key={reason}>
              {count} excluded: {exclusionLabels[reason]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CampaignDetailPage() {
  const { id } = useParams();
  const campaignId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canRun = user?.permissions.includes('sessions:run') ?? false;
  const [recipientStatus, setRecipientStatus] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<EligibilityPreview | null>(null);
  const [notice, setNotice] = useState('');

  const campaign = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.get(campaignId),
  });
  const recipients = useQuery({
    queryKey: ['campaign-recipients', campaignId, page, recipientStatus],
    queryFn: () => campaignsApi.recipients(campaignId, page, recipientStatus),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
    void queryClient.invalidateQueries({ queryKey: ['campaign-recipients', campaignId] });
    void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
  };
  const runPreview = useMutation({
    mutationFn: () => campaignsApi.preview(campaignId),
    onSuccess: (result) => {
      setPreview(result.data.preview);
      refresh();
    },
  });
  const action = useMutation({
    mutationFn: (name: 'start-simulation' | 'pause' | 'resume' | 'cancel') =>
      campaignsApi.action(campaignId, name),
    onSuccess: () => {
      setNotice('');
      refresh();
    },
  });
  const next = useMutation({
    mutationFn: () => campaignsApi.nextSession(campaignId),
    onSuccess: (sessionId) => {
      refresh();
      if (sessionId) navigate(`/studio?session=${sessionId}`);
      else setNotice('No recipients are waiting. The campaign is complete.');
    },
  });

  if (campaign.isLoading)
    return (
      <div className="complaint-detail-state">
        <LoaderCircle className="spin-icon" size={18} /> Loading campaign…
      </div>
    );
  if (campaign.isError || !campaign.data)
    return (
      <div className="complaint-detail-state">
        <AlertCircle size={18} /> {errorText(campaign.error, 'Could not load this campaign.')}
        <Link to="/campaigns">Back to campaigns</Link>
      </div>
    );

  const data = campaign.data.data;
  const { eligible, done, excluded, pending, inProgress } = counts(data);
  const progress = eligible ? Math.round((done / eligible) * 100) : 0;
  const busy = action.isPending || runPreview.isPending || next.isPending;
  const error = action.error ?? runPreview.error ?? next.error;
  const filter = data.targetFilter;
  const targetText =
    [
      filter.wards?.length ? `Wards ${filter.wards.join(', ')}` : null,
      filter.locality ? `Locality contains “${filter.locality}”` : null,
      filter.language ? `Prefers ${languageLabels[filter.language]}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'All citizens';

  return (
    <div className="complaints-page">
      <Link className="session-back" to="/campaigns">
        <ArrowLeft size={15} /> All campaigns
      </Link>
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">SIMULATION CAMPAIGN</div>
          <h1>{data.name}</h1>
          <p>
            {targetText} · {data.channel === 'voice' ? 'Voice' : 'Text'} ·{' '}
            {data.defaultLanguage
              ? languageLabels[data.defaultLanguage]
              : 'Assistant asks language'}{' '}
            · {data.maxAttempts} attempt{data.maxAttempts === 1 ? '' : 's'} per citizen
          </p>
        </div>
        <span className={`session-badge ${statusTone[data.status]}`}>
          {campaignStatusLabels[data.status]}
        </span>
      </div>
      <SimulationNote />

      <section className="complaint-panel campaign-control">
        <div className="campaign-stats">
          <div>
            <small>Eligible</small>
            <strong>{eligible}</strong>
          </div>
          <div>
            <small>Done</small>
            <strong>{done}</strong>
          </div>
          <div>
            <small>Waiting</small>
            <strong>{pending + inProgress}</strong>
          </div>
          <div>
            <small>Excluded</small>
            <strong>{excluded}</strong>
          </div>
          <div
            className="campaign-progress"
            aria-label={`${progress}% of eligible recipients done`}
          >
            <small>{progress}% done</small>
            <span className="meter">
              <i style={{ width: `${progress}%` }} />
            </span>
          </div>
        </div>
        <div className="campaign-actions">
          {(data.status === 'draft' || data.status === 'ready') && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => runPreview.mutate()}
            >
              <Users size={14} />{' '}
              {data.status === 'ready' ? 'Re-check eligibility' : 'Preview eligibility'}
            </button>
          )}
          {data.status === 'ready' && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => action.mutate('start-simulation')}
            >
              <Play size={15} /> Start simulation
            </button>
          )}
          {data.status === 'running' && canRun && (
            <button
              className="primary-button"
              disabled={busy || !pending}
              onClick={() => next.mutate()}
            >
              {next.isPending ? (
                <LoaderCircle size={15} className="spin-icon" />
              ) : (
                <PlayCircle size={15} />
              )}
              Run next recipient
            </button>
          )}
          {data.status === 'running' && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => action.mutate('pause')}
            >
              <Pause size={14} /> Pause
            </button>
          )}
          {data.status === 'paused' && (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => action.mutate('resume')}
            >
              <Play size={15} /> Resume
            </button>
          )}
          {['draft', 'ready', 'running', 'paused'].includes(data.status) && (
            <button
              className="secondary-button danger"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Cancel this campaign? Waiting recipients are skipped and any open test session is ended.',
                  )
                )
                  action.mutate('cancel');
              }}
            >
              <X size={14} /> Cancel campaign
            </button>
          )}
        </div>
        {data.status === 'draft' && !preview && (
          <p className="studio-muted">
            Step 1: preview eligibility. Only active citizens with a valid number and documented
            consent who have not opted out can be included.
          </p>
        )}
        {inProgress > 0 && data.status === 'running' && (
          <p className="studio-muted">
            {inProgress} conversation{inProgress === 1 ? ' is' : 's are'} open. Finish or end{' '}
            {inProgress === 1 ? 'it' : 'them'} in the call studio.
          </p>
        )}
        {preview && <PreviewResult preview={preview} />}
        {notice && <p className="campaign-preview">{notice}</p>}
        {error && (
          <div className="form-error" role="alert">
            {errorText(error, 'The action failed.')}
          </div>
        )}
      </section>

      <section className="complaint-panel">
        <div className="complaint-toolbar">
          <strong className="campaign-section-title">Recipients</strong>
          <label className="complaint-filter">
            <select
              aria-label="Filter recipients by status"
              value={recipientStatus}
              onChange={(event) => {
                setRecipientStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All recipients</option>
              {(Object.keys(recipientStatusLabels) as RecipientStatus[]).map((status) => (
                <option key={status} value={status}>
                  {recipientStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="complaint-table-scroll">
          <table className="complaint-table">
            <thead>
              <tr>
                <th>Citizen</th>
                <th>Status</th>
                <th>Reason / outcome</th>
                <th>Attempts</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {recipients.isLoading && (
                <tr>
                  <td colSpan={5} className="complaint-table-state">
                    <LoaderCircle className="spin-icon" size={18} /> Loading recipients…
                  </td>
                </tr>
              )}
              {recipients.data && !recipients.data.data.length && (
                <tr>
                  <td colSpan={5} className="complaint-table-state">
                    <strong>No recipients</strong>
                    <small>
                      {data.status === 'draft'
                        ? 'Run the eligibility preview to build the list.'
                        : 'No recipients match this filter.'}
                    </small>
                  </td>
                </tr>
              )}
              {recipients.data?.data.map((recipient) => (
                <tr key={recipient.id}>
                  <td>
                    <span className="ticket-person">
                      <span>
                        <strong>{recipient.citizen?.fullName || 'Unnamed citizen'}</strong>
                        <small>
                          {recipient.citizen?.phone ?? 'No phone'}
                          {recipient.citizen?.ward ? ` · Ward ${recipient.citizen.ward}` : ''}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span
                      className={`session-badge ${
                        recipient.status === 'completed'
                          ? 'success'
                          : recipient.status === 'in_progress'
                            ? 'info'
                            : recipient.status === 'failed'
                              ? 'warning'
                              : 'neutral'
                      }`}
                    >
                      {recipientStatusLabels[recipient.status]}
                    </span>
                  </td>
                  <td>
                    {recipient.exclusionReason
                      ? exclusionLabels[recipient.exclusionReason]
                      : recipient.lastSession?.outcome
                        ? outcomeLabels[recipient.lastSession.outcome]
                        : '—'}
                  </td>
                  <td>{recipient.attemptCount}</td>
                  <td>
                    {recipient.lastSession ? (
                      <Link
                        to={
                          recipient.lastSession.status === 'active'
                            ? `/studio?session=${recipient.lastSession.id}`
                            : `/sessions/${recipient.lastSession.id}`
                        }
                      >
                        {recipient.lastSession.status === 'active' ? 'Continue' : 'Transcript'}
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
          <span>{recipients.data?.pagination.total ?? 0} recipients</span>
          <div>
            <button
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {Math.max(1, recipients.data?.pagination.pages ?? 1)}
            </span>
            <button
              disabled={page >= (recipients.data?.pagination.pages ?? 1)}
              aria-label="Next page"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
