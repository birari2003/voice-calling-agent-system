import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ComplaintPhotos } from '../components/attachments/ComplaintPhotos';
import { ComplaintTranscript } from '../components/sessions/ComplaintTranscript';

export type ComplaintStatus =
  'registered' | 'acknowledged' | 'assigned' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
export type ComplaintPriority = 'low' | 'normal' | 'high' | 'urgent';
export interface ComplaintRecord {
  id: number;
  ticketId: string;
  citizenId: number;
  citizen: {
    id: number;
    fullName: string | null;
    phone: string | null;
    locality: string | null;
    ward: string | null;
  };
  category: string;
  description: string;
  locality: string;
  ward: string | null;
  landmark: string | null;
  locationVerified: boolean;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assignedTo: number | null;
  assignedDepartment: string | null;
  assignedUser?: { id: number; name: string } | null;
  source: 'staff' | 'simulated_ai';
  sourceSessionId: string | null;
  citizenConfirmed: boolean;
  citizenConfirmedAt: string | null;
  createdAt: string;
  statusHistory?: Array<{
    id: number;
    fromStatus: ComplaintStatus | null;
    toStatus: ComplaintStatus;
    note: string | null;
    changedAt: string;
    changedByUser?: { name: string };
  }>;
  notes?: Array<{ id: number; body: string; createdAt: string; author?: { name: string } }>;
}

interface ComplaintPageData {
  data: ComplaintRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const statusLabels: Record<ComplaintStatus, string> = {
  registered: 'Registered',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  reopened: 'Reopened',
};
export const priorityLabels: Record<ComplaintPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};
const statusOptions = Object.keys(statusLabels) as ComplaintStatus[];
const priorityOptions = Object.keys(priorityLabels) as ComplaintPriority[];
const pageSize = 20;

export function ComplaintsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const canCreate = user?.permissions.includes('complaints:create') ?? false;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    return params.toString();
  }, [page, search, status, priority]);
  const query = useQuery({
    queryKey: ['complaints', queryString],
    queryFn: () => apiRequest<ComplaintPageData>(`/complaints?${queryString}`),
  });

  const archive = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/complaints/${id}/archive`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      setToast('Complaint archived.');
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not archive complaint.'),
  });
  const canArchive = user?.permissions.includes('complaints:archive') ?? false;

  return (
    <div className="complaints-page">
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">SERVICE TRACKING</div>
          <h1>Complaints</h1>
          <p>Track registered issues, ownership, priority, and resolution progress.</p>
        </div>
        {canCreate && (
          <button className="primary-button" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Register complaint
          </button>
        )}
      </div>
      <section className="complaint-summary-strip">
        <span className="complaint-summary-icon">
          <ClipboardList size={19} />
        </span>
        <span>
          <strong>{query.data?.pagination.total ?? '—'}</strong>
          <small>complaints matching filters</small>
        </span>
        <i />
        <ShieldCheck size={15} />
        <p>
          Ticket IDs are generated by the server. New records require a confirmation attestation.
        </p>
      </section>
      <section className="complaint-panel">
        <div className="complaint-toolbar">
          <label className="complaint-search">
            <Search size={16} />
            <input
              aria-label="Search complaints"
              placeholder="Ticket, citizen, phone, locality…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <label className="complaint-filter">
            <Filter size={14} />
            <select
              aria-label="Filter by complaint status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {statusOptions.map((value) => (
                <option key={value} value={value}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="complaint-filter">
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {priorityOptions.map((value) => (
                <option key={value} value={value}>
                  {priorityLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <span className="complaint-count">{query.data?.pagination.total ?? '—'} records</span>
        </div>
        {error && (
          <div className="complaint-error">
            <AlertCircle size={15} />
            {error}
            <button aria-label="Dismiss error" onClick={() => setError('')}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="complaint-table-scroll">
          <table className="complaint-table">
            <thead>
              <tr>
                <th>Ticket / citizen</th>
                <th>Category</th>
                <th>Location</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {query.isLoading && (
                <tr>
                  <td colSpan={8} className="complaint-table-state">
                    <LoaderCircle className="spin-icon" size={18} />
                    Loading complaints…
                  </td>
                </tr>
              )}
              {query.isError && (
                <tr>
                  <td colSpan={8} className="complaint-table-state error">
                    Could not load complaints. Refresh or sign in again.
                  </td>
                </tr>
              )}
              {!query.isLoading && !query.isError && query.data?.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="complaint-table-state">
                    <span className="complaint-empty-icon">
                      <ClipboardList size={20} />
                    </span>
                    <strong>No complaints found</strong>
                    <small>Change the filters or register a complaint.</small>
                  </td>
                </tr>
              )}
              {query.data?.data.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link className="ticket-person" to={`/complaints/${item.id}`}>
                      <span className="ticket-symbol">#{item.ticketId.slice(-4)}</span>
                      <span>
                        <strong>{item.ticketId}</strong>
                        <small>
                          {item.citizen?.fullName || item.citizen?.phone || 'Citizen record'}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <span className="complaint-category">{item.category}</span>
                  </td>
                  <td>
                    <span className="complaint-location">
                      <strong>{item.locality}</strong>
                      <small>{item.ward ? `Ward ${item.ward}` : 'Ward not set'}</small>
                    </span>
                  </td>
                  <td>
                    <span className={`priority-pill ${item.priority}`}>
                      {priorityLabels[item.priority]}
                    </span>
                  </td>
                  <td>
                    <span className={`complaint-status ${item.status}`}>
                      <i />
                      {statusLabels[item.status]}
                    </span>
                  </td>
                  <td>
                    <span className="assignee-cell">
                      {item.assignedUser?.name ?? item.assignedDepartment ?? 'Unassigned'}
                    </span>
                  </td>
                  <td>
                    <span className="complaint-date">
                      {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
                        new Date(item.createdAt),
                      )}
                    </span>
                  </td>
                  <td>
                    {canArchive && (
                      <button
                        className="complaint-more"
                        aria-label={`Archive ${item.ticketId}`}
                        title="Archive complaint"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Archive ${item.ticketId}? It will be removed from the active list.`,
                            )
                          )
                            archive.mutate(item.id);
                        }}
                      >
                        •••
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="complaint-pagination">
          <span>
            Showing {query.data?.data.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, query.data?.pagination.total ?? 0)} of{' '}
            {query.data?.pagination.total ?? 0}
          </span>
          <div>
            <button
              disabled={page <= 1}
              aria-label="Previous page"
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {Math.max(1, query.data?.pagination.pages ?? 1)}
            </span>
            <button
              disabled={page >= (query.data?.pagination.pages ?? 1)}
              aria-label="Next page"
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <div className="complaint-footnote">
        <Clock3 size={14} />
        Status changes and internal notes are recorded with the responsible staff member and time.
      </div>
      {showCreate && (
        <ComplaintEditor
          onClose={() => setShowCreate(false)}
          onCreated={(record) => {
            setShowCreate(false);
            setToast(`Complaint ${record.ticketId} registered.`);
            void queryClient.invalidateQueries({ queryKey: ['complaints'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] });
          }}
        />
      )}
      {toast && (
        <div className="toast-message">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  );
}

function ComplaintEditor({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (complaint: ComplaintRecord) => void;
}) {
  const [citizenId, setCitizenId] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [locality, setLocality] = useState('');
  const [ward, setWard] = useState('');
  const [landmark, setLandmark] = useState('');
  const [priority, setPriority] = useState<ComplaintPriority>('normal');
  const [locationVerified, setLocationVerified] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const citizens = useQuery({
    queryKey: ['citizens', 'complaint-form'],
    queryFn: () =>
      apiRequest<{
        data: Array<{
          id: number;
          fullName: string | null;
          phone: string | null;
          locality: string | null;
          ward: string | null;
        }>;
      }>('/citizens?status=active&limit=100&sortBy=fullName&sortOrder=asc'),
  });

  useEffect(() => {
    const selected = citizens.data?.data.find((citizen) => String(citizen.id) === citizenId);
    if (!selected) return;
    setLocality(selected.locality ?? '');
    setWard(selected.ward ?? '');
  }, [citizenId, citizens.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const response = await apiRequest<{ data: ComplaintRecord }>('/complaints', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          citizenId: Number(citizenId),
          category,
          description,
          locality,
          ward: ward || null,
          landmark: landmark || null,
          locationVerified,
          priority,
          confirmed,
        }),
      });
      onCreated(response.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not register this complaint.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal complaint-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="complaint-editor-title"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">STAFF INTAKE</span>
            <h2 id="complaint-editor-title">Register complaint</h2>
            <p>Record the citizen’s issue and confirmed details.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="modal-body">
            <label className="complaint-field">
              Citizen
              <select
                required
                value={citizenId}
                onChange={(event) => setCitizenId(event.target.value)}
              >
                <option value="">Select a citizen record</option>
                {citizens.data?.data.map((citizen) => (
                  <option value={citizen.id} key={citizen.id}>
                    {citizen.fullName || 'Name not provided'}
                    {citizen.phone ? ` · ${citizen.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {citizens.isError && (
              <div className="form-error">
                Could not load citizens. Add a citizen record before registering a complaint.
              </div>
            )}
            {citizens.data?.data.length === 0 && (
              <div className="empty-citizen-note">
                There are no active citizen records yet. Add a citizen first.
              </div>
            )}
            <div className="complaint-form-grid">
              <label className="complaint-field">
                Category
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="e.g. Waste management"
                />
              </label>
              <label className="complaint-field">
                Priority
                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as ComplaintPriority)}
                >
                  {priorityOptions.map((value) => (
                    <option key={value} value={value}>
                      {priorityLabels[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="complaint-field wide">
                Issue description
                <textarea
                  required
                  minLength={10}
                  maxLength={10000}
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the reported problem clearly"
                />
              </label>
              <label className="complaint-field">
                Locality / area
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={locality}
                  onChange={(event) => setLocality(event.target.value)}
                  placeholder="Area, road, or colony"
                />
              </label>
              <label className="complaint-field">
                Ward
                <input
                  maxLength={40}
                  value={ward}
                  onChange={(event) => setWard(event.target.value)}
                  placeholder="Ward number"
                />
              </label>
              <label className="complaint-field wide">
                Nearest landmark
                <input
                  maxLength={160}
                  value={landmark}
                  onChange={(event) => setLandmark(event.target.value)}
                  placeholder="Optional landmark"
                />
              </label>
            </div>
            <label className="complaint-check">
              <input
                type="checkbox"
                checked={locationVerified}
                onChange={(event) => setLocationVerified(event.target.checked)}
              />
              <span>
                <strong>Location verified with the citizen</strong>
                <small>Only select this after confirming the location details.</small>
              </span>
            </label>
            <label className="complaint-check confirmation-check">
              <input
                type="checkbox"
                checked={confirmed}
                required
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                <strong>I confirm the citizen explicitly accepted these complaint details</strong>
                <small>
                  Do not register until the issue and location have been read back and confirmed.
                </small>
              </span>
            </label>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={saving || !citizens.data?.data.length || !confirmed}
            >
              {saving && <LoaderCircle className="spin-icon" size={15} />}Register ticket
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function ComplaintDetailPage() {
  const { id } = useParams();
  const complaintId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const detail = useQuery({
    queryKey: ['complaint', complaintId],
    queryFn: () => apiRequest<{ data: ComplaintRecord }>(`/complaints/${complaintId}`),
    enabled: Number.isInteger(complaintId) && complaintId > 0,
  });
  const record = detail.data?.data;
  const canReadAll = user?.permissions.includes('complaints:read_all') ?? false;
  const canUpdate =
    (user?.permissions.includes('complaints:update_all') ?? false) ||
    record?.assignedTo === user?.id;
  const canAssign = user?.permissions.includes('complaints:assign') ?? false;
  const canAddNotes = user?.permissions.includes('complaints:notes') ?? false;
  const staff = useQuery({
    queryKey: ['complaint-assignees'],
    queryFn: () =>
      apiRequest<{ data: Array<{ id: number; name: string; role: string }> }>(
        '/complaints/assignees',
      ),
    enabled: canAssign,
  });
  useEffect(() => {
    if (!record) return;
    setAssignedTo(record.assignedTo ? String(record.assignedTo) : '');
    setDepartment(record.assignedDepartment ?? '');
  }, [record?.id, record?.assignedTo, record?.assignedDepartment]);

  async function mutate(path: string, body: unknown, success: string) {
    setError('');
    try {
      await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setToast(success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['complaint', complaintId] }),
        queryClient.invalidateQueries({ queryKey: ['complaints'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'overview'] }),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this change.');
    }
  }

  if (detail.isLoading)
    return (
      <div className="complaint-detail-state">
        <LoaderCircle className="spin-icon" />
        Loading complaint…
      </div>
    );
  if (detail.isError || !record)
    return (
      <div className="complaint-detail-state error">
        <AlertCircle />
        Complaint unavailable or you do not have access.
        <button className="secondary-button" onClick={() => navigate('/complaints')}>
          Back to complaints
        </button>
      </div>
    );

  const allowedNext = canUpdate
    ? (
        {
          registered: ['acknowledged', 'in_progress'],
          acknowledged: ['in_progress'],
          assigned: ['in_progress', 'reopened'],
          in_progress: ['resolved', 'reopened'],
          resolved: ['closed', 'reopened'],
          closed: ['reopened'],
          reopened: ['in_progress'],
        } as Record<ComplaintStatus, ComplaintStatus[]>
      )[record.status]
    : [];

  return (
    <div className="complaints-page complaint-detail-page">
      <button className="back-link" onClick={() => navigate('/complaints')}>
        <ArrowLeft size={15} />
        All complaints
      </button>
      <div className="complaints-heading detail-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">COMPLAINT RECORD</div>
          <h1>{record.ticketId}</h1>
          <p>
            Registered{' '}
            {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(record.createdAt),
            )}
          </p>
        </div>
        <span className={`complaint-status ${record.status}`}>
          <i />
          {statusLabels[record.status]}
        </span>
      </div>
      {error && (
        <div className="complaint-error" role="alert">
          <AlertCircle size={15} />
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast-message">
          <Check size={15} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss message">
            <X size={14} />
          </button>
        </div>
      )}
      <div className="complaint-detail-grid">
        <div className="complaint-detail-main">
          <section className="complaint-detail-card">
            <div className="detail-card-heading">
              <div>
                <span className="eyebrow">REPORTED ISSUE</span>
                <h2>{record.category}</h2>
              </div>
              <span className={`priority-pill ${record.priority}`}>
                {priorityLabels[record.priority]} priority
              </span>
            </div>
            <p className="complaint-description">{record.description}</p>
            <div className="detail-facts">
              <div>
                <small>Locality</small>
                <strong>{record.locality}</strong>
              </div>
              <div>
                <small>Ward</small>
                <strong>{record.ward || 'Not provided'}</strong>
              </div>
              <div>
                <small>Landmark</small>
                <strong>{record.landmark || 'Not provided'}</strong>
              </div>
              <div>
                <small>Location checked</small>
                <strong>
                  {record.locationVerified ? 'Verified with citizen' : 'Not verified'}
                </strong>
              </div>
            </div>
            {record.source === 'simulated_ai' && record.sourceSessionId && (
              <p className="complaint-session-link">
                Registered from a simulated AI session after the citizen confirmed the read-back.{' '}
                {user?.permissions.includes('sessions:read') && (
                  <Link to={`/sessions/${record.sourceSessionId}`}>Open session record</Link>
                )}
              </p>
            )}
            {record.source === 'simulated_ai' && record.sourceSessionId && (
              <ComplaintTranscript complaintId={record.id} />
            )}
          </section>
          {canUpdate && allowedNext.length > 0 && (
            <section className="complaint-detail-card">
              <span className="eyebrow">UPDATE PROGRESS</span>
              <h2>Change status</h2>
              <label className="complaint-field">
                Status note (optional)
                <input
                  maxLength={500}
                  value={statusNote}
                  onChange={(event) => setStatusNote(event.target.value)}
                  placeholder="Add a brief internal update"
                />
              </label>
              <div className="status-actions">
                {allowedNext.map((next) => (
                  <button
                    className={
                      next === 'resolved' || next === 'closed'
                        ? 'primary-button'
                        : 'secondary-button'
                    }
                    key={next}
                    onClick={() =>
                      void mutate(
                        `/complaints/${complaintId}/status`,
                        { toStatus: next, note: statusNote },
                        `Status changed to ${statusLabels[next]}.`,
                      )
                    }
                  >
                    {statusLabels[next]}
                  </button>
                ))}
              </div>
            </section>
          )}
          {user?.permissions.includes('attachments:read') && (
            <ComplaintPhotos
              complaintId={record.id}
              canUpload={canUpdate && (user?.permissions.includes('attachments:upload') ?? false)}
            />
          )}
          <section className="complaint-detail-card">
            <span className="eyebrow">ACTIVITY</span>
            <h2>Status history</h2>
            <div className="complaint-timeline">
              {record.statusHistory?.map((entry) => (
                <div className="timeline-entry" key={entry.id}>
                  <i />
                  <div>
                    <strong>
                      {entry.fromStatus
                        ? `${statusLabels[entry.fromStatus]} → ${statusLabels[entry.toStatus]}`
                        : 'Complaint registered'}
                    </strong>
                    <small>
                      {entry.changedByUser?.name ?? 'Staff'} ·{' '}
                      {new Intl.DateTimeFormat('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.changedAt))}
                    </small>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="complaint-detail-card">
            <span className="eyebrow">INTERNAL NOTES</span>
            <h2>Staff discussion</h2>
            {canAddNotes && (
              <form
                className="note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (note.trim())
                    void mutate(
                      `/complaints/${complaintId}/notes`,
                      { body: note },
                      'Internal note added.',
                    ).then(() => setNote(''));
                }}
              >
                <textarea
                  required
                  maxLength={5000}
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add an internal note for staff…"
                />
                <button className="primary-button" disabled={!note.trim()}>
                  Add note
                </button>
              </form>
            )}
            <div className="notes-list">
              {record.notes?.length ? (
                record.notes.map((entry) => (
                  <div className="note-item" key={entry.id}>
                    <p>{entry.body}</p>
                    <small>
                      {entry.author?.name ?? 'Staff'} ·{' '}
                      {new Intl.DateTimeFormat('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(entry.createdAt))}
                    </small>
                  </div>
                ))
              ) : (
                <p className="empty-notes">No internal notes yet.</p>
              )}
            </div>
          </section>
        </div>
        <aside className="complaint-detail-side">
          <section className="complaint-detail-card">
            <span className="eyebrow">CITIZEN</span>
            <h2>{record.citizen?.fullName || 'Name not provided'}</h2>
            <div className="citizen-contact">
              <UserRound size={15} />
              <span>{record.citizen?.phone || 'No phone number'}</span>
            </div>
            <div className="detail-facts side-facts">
              <div>
                <small>Citizen locality</small>
                <strong>{record.citizen?.locality || 'Not provided'}</strong>
              </div>
              <div>
                <small>Citizen ward</small>
                <strong>{record.citizen?.ward || 'Not provided'}</strong>
              </div>
              <div>
                <small>Confirmation</small>
                <strong>{record.citizenConfirmed ? 'Confirmed' : 'Not confirmed'}</strong>
              </div>
            </div>
          </section>
          <section className="complaint-detail-card">
            <span className="eyebrow">OWNERSHIP</span>
            <h2>Assignment</h2>
            <div className="current-assignee">
              <UserRound size={16} />
              <span>{record.assignedUser?.name || record.assignedDepartment || 'Unassigned'}</span>
            </div>
            {canAssign && (
              <form
                className="assignment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutate(
                    `/complaints/${complaintId}/assign`,
                    {
                      assignedTo: assignedTo ? Number(assignedTo) : null,
                      department: department || null,
                    },
                    'Assignment saved.',
                  );
                }}
              >
                <label className="complaint-field">
                  Staff member
                  <select
                    value={assignedTo}
                    onChange={(event) => setAssignedTo(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {staff.data?.data.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="complaint-field">
                  Department
                  <input
                    maxLength={120}
                    value={department}
                    onChange={(event) => setDepartment(event.target.value)}
                    placeholder="Department or team"
                  />
                </label>
                <button className="secondary-button">Save assignment</button>
              </form>
            )}
            {!canAssign && !canReadAll && (
              <p className="permission-hint">Assigned cases are managed by your role.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
