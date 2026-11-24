import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

type Language = 'as' | 'hi' | 'en';
interface Citizen {
  id: number;
  fullName: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  preferredLanguage: Language;
  locality: string | null;
  ward: string | null;
  contactAuthorized: boolean;
  consentSource: string | null;
  optedOut: boolean;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}
interface CitizenPageData {
  data: Citizen[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
type MappingField =
  | 'fullName'
  | 'phone'
  | 'whatsappNumber'
  | 'preferredLanguage'
  | 'locality'
  | 'ward'
  | 'contactAuthorized'
  | 'consentSource'
  | 'optedOut'
  | 'notes';
type ImportReview = {
  headers: string[];
  mapping: Partial<Record<MappingField, string>>;
  suggestedMapping: Partial<Record<MappingField, string>>;
  summary: { total: number; ready: number; duplicates: number; invalid: number };
  rows: Array<{
    rowNumber: number;
    status: string;
    errors: string[];
    citizen?: { fullName?: string; phone?: string };
  }>;
};

const pageSize = 20;
const languageLabels: Record<Language, string> = { as: 'Assamese', hi: 'Hindi', en: 'English' };
const importFields: Array<{ key: MappingField; label: string }> = [
  { key: 'fullName', label: 'Full name' },
  { key: 'phone', label: 'Phone number' },
  { key: 'whatsappNumber', label: 'WhatsApp number' },
  { key: 'preferredLanguage', label: 'Preferred language' },
  { key: 'locality', label: 'Locality' },
  { key: 'ward', label: 'Ward' },
  { key: 'contactAuthorized', label: 'Contact authorized' },
  { key: 'consentSource', label: 'Consent source' },
  { key: 'optedOut', label: 'Opted out' },
  { key: 'notes', label: 'Notes' },
];

export function CitizensPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions.includes('citizens:manage') ?? false;
  const canImport = user?.permissions.includes('citizens:import') ?? false;
  const canExport = user?.permissions.includes('citizens:export') ?? false;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Citizen | 'new' | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState('');
  const [pageError, setPageError] = useState('');

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
    if (status !== 'all') params.set('status', status);
    return params.toString();
  }, [page, search, status]);
  const citizensQuery = useQuery({
    queryKey: ['citizens', queryString],
    queryFn: () => apiRequest<CitizenPageData>(`/citizens?${queryString}`),
  });

  const deactivate = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/citizens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['citizens'] });
      setToast('Citizen record deactivated.');
    },
    onError: (error) =>
      setPageError(error instanceof Error ? error.message : 'Could not deactivate record.'),
  });

  async function exportCsv() {
    setPageError('');
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';
      const response = await fetch(`${base}/citizens/export`, { credentials: 'include' });
      if (!response.ok)
        throw new Error('Export could not be downloaded. Check your access and retry.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'citizens.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  return (
    <div className="citizens-page">
      <div className="citizens-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">PEOPLE DIRECTORY</div>
          <h1>Citizens</h1>
          <p>Manage contact records and documented contact preferences.</p>
        </div>
        <div className="citizen-actions">
          {canExport && (
            <button className="secondary-button" onClick={() => void exportCsv()}>
              <Download size={16} />
              Export
            </button>
          )}
          {canImport && (
            <button className="secondary-button" onClick={() => setShowImport(true)}>
              <Upload size={16} />
              Import
            </button>
          )}
          {canManage && (
            <button className="primary-button add-citizen" onClick={() => setEditor('new')}>
              <Plus size={17} />
              Add citizen
            </button>
          )}
        </div>
      </div>
      <section className="citizens-summary">
        <div className="summary-mark">
          <UserRound size={20} />
        </div>
        <div>
          <strong>{citizensQuery.data?.pagination.total ?? '—'}</strong>
          <span>records matching current filters</span>
        </div>
        <span className="summary-separator" />
        <ShieldCheck size={16} className="summary-shield" />
        <p>Contact authorization and opt-out are tracked separately for every person.</p>
      </section>
      <section className="citizen-table-panel">
        <div className="citizen-toolbar">
          <div className="citizen-search">
            <Search size={16} />
            <input
              aria-label="Search citizens"
              placeholder="Search name, phone, locality…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <label className="filter-select">
            <Filter size={15} />
            <select
              aria-label="Filter citizen records"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="active">Active records</option>
              <option value="all">All records</option>
              <option value="inactive">Inactive</option>
              <option value="authorized">Authorized contacts</option>
              <option value="opted_out">Opted out</option>
            </select>
          </label>
          <span className="table-count">{citizensQuery.data?.pagination.total ?? '—'} records</span>
        </div>
        {pageError && (
          <div className="citizen-alert" role="alert">
            <X size={15} />
            {pageError}
            <button aria-label="Dismiss" onClick={() => setPageError('')}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="citizen-table-scroll">
          <table className="citizen-table">
            <thead>
              <tr>
                <th>Citizen</th>
                <th>Contact</th>
                <th>Locality / ward</th>
                <th>Language</th>
                <th>Contact status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {citizensQuery.isLoading && (
                <tr>
                  <td colSpan={6} className="table-state">
                    <LoaderCircle className="spin-icon" size={20} />
                    Loading citizen records…
                  </td>
                </tr>
              )}
              {citizensQuery.isError && (
                <tr>
                  <td colSpan={6} className="table-state table-error">
                    Could not load citizen records. Refresh or sign in again.
                  </td>
                </tr>
              )}
              {!citizensQuery.isLoading &&
                !citizensQuery.isError &&
                citizensQuery.data?.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-state">
                      <span className="empty-table-icon">
                        <Users size={20} />
                      </span>
                      <strong>No citizens found</strong>
                      <span>Try a different search or add a new record.</span>
                    </td>
                  </tr>
                )}
              {citizensQuery.data?.data.map((citizen) => (
                <tr key={citizen.id} className={!citizen.isActive ? 'row-inactive' : ''}>
                  <td>
                    <div className="citizen-person">
                      <span className="person-avatar">
                        {(citizen.fullName?.[0] ?? citizen.phone?.slice(-2) ?? '?').toUpperCase()}
                      </span>
                      <span>
                        <strong>{citizen.fullName || 'Name not provided'}</strong>
                        <small>
                          Added{' '}
                          {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
                            new Date(citizen.createdAt),
                          )}
                        </small>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="contact-cell">
                      <strong>{citizen.phone ?? 'No phone number'}</strong>
                      {citizen.whatsappNumber && citizen.whatsappNumber !== citizen.phone && (
                        <small>WA {citizen.whatsappNumber}</small>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="locality-cell">
                      <strong>{citizen.locality || '—'}</strong>
                      <small>{citizen.ward ? `Ward ${citizen.ward}` : 'Ward not set'}</small>
                    </div>
                  </td>
                  <td>
                    <span className="language-chip">
                      {languageLabels[citizen.preferredLanguage]}
                    </span>
                  </td>
                  <td>
                    <div className="status-stack">
                      {!citizen.isActive ? (
                        <span className="status-badge inactive">Inactive</span>
                      ) : citizen.optedOut ? (
                        <span className="status-badge opted-out">Opted out</span>
                      ) : citizen.contactAuthorized ? (
                        <span className="status-badge authorized">
                          <Check size={12} />
                          Authorized
                        </span>
                      ) : (
                        <span className="status-badge not-authorized">Not authorized</span>
                      )}
                      {citizen.contactAuthorized && citizen.consentSource && (
                        <small>via {citizen.consentSource}</small>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      {canManage && (
                        <button className="row-action" onClick={() => setEditor(citizen)}>
                          Edit
                        </button>
                      )}
                      {canManage && citizen.isActive && (
                        <button
                          className="row-more"
                          aria-label={`Deactivate ${citizen.fullName ?? 'citizen'}`}
                          title="Deactivate"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Deactivate this citizen record? It will remain available in the inactive filter.',
                              )
                            )
                              deactivate.mutate(citizen.id);
                          }}
                        >
                          •••
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-pagination">
          <span>
            Showing {citizensQuery.data?.data.length ? (page - 1) * pageSize + 1 : 0}–
            {Math.min(page * pageSize, citizensQuery.data?.pagination.total ?? 0)} of{' '}
            {citizensQuery.data?.pagination.total ?? 0}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page} of {Math.max(1, citizensQuery.data?.pagination.pages ?? 1)}
            </span>
            <button
              aria-label="Next page"
              disabled={page >= (citizensQuery.data?.pagination.pages ?? 1)}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <div className="citizen-footnote">
        <ShieldCheck size={14} />
        <span>
          Phone numbers are normalized for India. A saved phone number does not imply permission to
          contact someone.
        </span>
      </div>
      {editor && (
        <CitizenEditor
          citizen={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            setToast(message);
            void queryClient.invalidateQueries({ queryKey: ['citizens'] });
          }}
        />
      )}
      {showImport && (
        <CitizenImport
          onClose={() => setShowImport(false)}
          onImported={(summary) => {
            setShowImport(false);
            setToast(
              `Import complete: ${summary.imported} added, ${summary.duplicates} duplicates skipped, ${summary.invalid} invalid.`,
            );
            void queryClient.invalidateQueries({ queryKey: ['citizens'] });
          }}
        />
      )}
      {toast && (
        <div className="toast-message">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function CitizenEditor({
  citizen,
  onClose,
  onSaved,
}: {
  citizen: Citizen | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [fullName, setFullName] = useState(citizen?.fullName ?? '');
  const [phone, setPhone] = useState(citizen?.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(citizen?.whatsappNumber ?? '');
  const [language, setLanguage] = useState<Language>(citizen?.preferredLanguage ?? 'as');
  const [locality, setLocality] = useState(citizen?.locality ?? '');
  const [ward, setWard] = useState(citizen?.ward ?? '');
  const [authorized, setAuthorized] = useState(citizen?.contactAuthorized ?? false);
  const [consentSource, setConsentSource] = useState(citizen?.consentSource ?? '');
  const [optedOut, setOptedOut] = useState(citizen?.optedOut ?? false);
  const [notes, setNotes] = useState(citizen?.notes ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      fullName: fullName.trim() || null,
      phone: phone.trim() || null,
      whatsappNumber: whatsapp.trim() || null,
      preferredLanguage: language,
      locality: locality.trim() || null,
      ward: ward.trim() || null,
      contactAuthorized: optedOut ? false : authorized,
      consentSource: consentSource.trim() || null,
      optedOut,
      notes: notes.trim() || null,
    };
    try {
      if (citizen)
        await apiRequest(`/citizens/${citizen.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      else await apiRequest('/citizens', { method: 'POST', body: JSON.stringify(payload) });
      onSaved(citizen ? 'Citizen record updated.' : 'Citizen record created.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save this citizen record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal citizen-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="citizen-editor-title"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">CITIZEN RECORD</span>
            <h2 id="citizen-editor-title">{citizen ? 'Edit citizen' : 'Add citizen'}</h2>
            <p>Record contact details and documented preferences.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="modal-body">
            <div className="form-grid">
              <label className="field full-field">
                Full name <span>Optional if phone is provided</span>
                <input
                  autoFocus
                  maxLength={160}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Citizen’s full name"
                />
              </label>
              <label className="field">
                Phone number
                <input
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
              <label className="field">
                WhatsApp number <span>Optional</span>
                <input
                  inputMode="tel"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="+91 98765 43210"
                />
              </label>
              <label className="field">
                Preferred language
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as Language)}
                >
                  <option value="as">Assamese</option>
                  <option value="hi">Hindi</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="field">
                Ward
                <input
                  maxLength={40}
                  value={ward}
                  onChange={(event) => setWard(event.target.value)}
                  placeholder="e.g. 12"
                />
              </label>
              <label className="field full-field">
                Locality / area
                <input
                  maxLength={160}
                  value={locality}
                  onChange={(event) => setLocality(event.target.value)}
                  placeholder="Colony, road, or neighborhood"
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={authorized && !optedOut}
                  disabled={optedOut}
                  onChange={(event) => setAuthorized(event.target.checked)}
                />
                <span>
                  <strong>Documented authorization to contact</strong>
                  <small>Only check this when authorization has been recorded.</small>
                </span>
              </label>
              {authorized && !optedOut && (
                <label className="field full-field">
                  Consent source
                  <input
                    required
                    maxLength={120}
                    value={consentSource}
                    onChange={(event) => setConsentSource(event.target.value)}
                    placeholder="e.g. signed form, in-person consent"
                  />
                </label>
              )}
              <label className="check-field opt-out-check">
                <input
                  type="checkbox"
                  checked={optedOut}
                  onChange={(event) => {
                    setOptedOut(event.target.checked);
                    if (event.target.checked) setAuthorized(false);
                  }}
                />
                <span>
                  <strong>Opted out / do not contact</strong>
                  <small>Opt-out takes precedence over authorization.</small>
                </span>
              </label>
              <label className="field full-field">
                Internal notes <span>Optional</span>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Notes for authorized staff"
                />
              </label>
            </div>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <p className="consent-note">
              <ShieldCheck size={14} /> A phone number alone is not authorization to call.
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving && <LoaderCircle className="spin-icon" size={15} />}
              {citizen ? 'Save changes' : 'Create record'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CitizenImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (summary: { imported: number; duplicates: number; invalid: number }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<MappingField, string>>>({});
  const [review, setReview] = useState<ImportReview | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function requestReview(
    nextFile: File,
    nextMapping?: Partial<Record<MappingField, string>>,
  ) {
    setError('');
    setWorking(true);
    const body = new FormData();
    body.append('file', nextFile);
    if (nextMapping) body.append('mapping', JSON.stringify(nextMapping));
    try {
      const response = await apiRequest<{ data: ImportReview }>('/citizens/import/preview', {
        method: 'POST',
        body,
      });
      setReview(response.data);
      setMapping(response.data.mapping);
    } catch (caught) {
      setReview(null);
      setError(caught instanceof Error ? caught.message : 'Could not preview this file.');
    } finally {
      setWorking(false);
    }
  }

  function selectFile(nextFile?: File) {
    setFile(nextFile ?? null);
    setReview(null);
    setMapping({});
    setError('');
    if (nextFile) void requestReview(nextFile);
  }

  async function confirmImport() {
    if (!file) return;
    setWorking(true);
    setError('');
    const body = new FormData();
    body.append('file', file);
    body.append('mapping', JSON.stringify(mapping));
    try {
      const response = await apiRequest<{
        data: { imported: number; duplicates: number; invalid: number };
      }>('/citizens/import', { method: 'POST', body });
      onImported(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Import failed.');
    } finally {
      setWorking(false);
    }
  }

  const mappingNeedsReview = review
    ? importFields.some(({ key }) => (mapping[key] ?? '') !== (review.mapping[key] ?? ''))
    : true;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">BULK IMPORT</span>
            <h2 id="import-title">Import citizens</h2>
            <p>Upload CSV or XLSX; preview and map columns before saving.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <label className="file-drop">
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <span className="file-drop-icon">
              <FileSpreadsheet size={21} />
            </span>
            <strong>{file?.name ?? 'Choose a CSV or XLSX file'}</strong>
            <small>Maximum 5 MB · up to 5,000 rows</small>
            <span className="secondary-button file-choose">Browse files</span>
          </label>
          {working && (
            <div className="import-loading">
              <LoaderCircle className="spin-icon" size={17} />
              Reading and validating rows…
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {review && (
            <>
              <div className="import-summary">
                <span>
                  <strong>{review.summary.total}</strong>Total rows
                </span>
                <span className="import-ready">
                  <strong>{review.summary.ready}</strong>Ready
                </span>
                <span className="import-duplicate">
                  <strong>{review.summary.duplicates}</strong>Duplicates
                </span>
                <span className="import-invalid">
                  <strong>{review.summary.invalid}</strong>Invalid
                </span>
              </div>
              <div className="mapping-heading">
                <strong>Map file columns</strong>
                <small>Suggested mappings can be changed before previewing again.</small>
              </div>
              <div className="mapping-grid">
                {importFields.map(({ key, label }) => (
                  <label key={key}>
                    {label}
                    <select
                      value={mapping[key] ?? ''}
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [key]: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Not mapped</option>
                      {review.headers.map((header, index) => (
                        <option value={header} key={`${header}-${index}`}>
                          {header || `Column ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                className="text-action"
                disabled={working || !file}
                onClick={() => file && void requestReview(file, mapping)}
              >
                <Filter size={14} />
                Recheck using these mappings
              </button>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Citizen</th>
                      <th>Phone</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.rows.slice(0, 8).map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.rowNumber}</td>
                        <td>{row.citizen?.fullName || '—'}</td>
                        <td>{row.citizen?.phone || '—'}</td>
                        <td>
                          <span className={`import-row-status ${row.status}`}>{row.status}</span>
                          {row.errors[0] && <small>{row.errors[0]}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {review.summary.total > 8 && (
                  <div className="more-rows">Showing first 8 of {review.summary.total} rows</div>
                )}
              </div>
              <p className="consent-note">
                <ShieldCheck size={14} /> Imports never create contact authorization unless your
                mapped file explicitly includes a valid authorization and consent source.
              </p>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={!review || review.summary.ready === 0 || working || mappingNeedsReview}
            onClick={() => void confirmImport()}
          >
            {working && <LoaderCircle className="spin-icon" size={15} />}Import{' '}
            {review?.summary.ready ?? 0} ready rows
          </button>
        </div>
      </section>
    </div>
  );
}
