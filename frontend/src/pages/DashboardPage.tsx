import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  FileText,
  Megaphone,
  Radio,
  PhoneForwarded,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Overview {
  organization: { id: number; name: string };
  phase: string;
  metrics: Record<string, number | null>;
  message: string;
}

const numberFormat = new Intl.NumberFormat('en-IN');
const fmt = (value: number | null | undefined) =>
  typeof value === 'number' ? numberFormat.format(value) : '—';
const pct = (part: number | null | undefined, whole: number | null | undefined) =>
  typeof part === 'number' && typeof whole === 'number' && whole > 0
    ? Math.round((part / whole) * 100)
    : null;

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => apiRequest<Overview>('/dashboard/overview'),
  });
  const m = data?.metrics ?? {};
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const canSee = (permission: string) => user?.permissions.includes(permission) ?? false;
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const total = m.complaints ?? 0;
  const inProgress = m.inProgressComplaints ?? 0;
  const resolved = m.resolvedComplaints ?? 0;
  const open = Math.max(total - inProgress - resolved, 0);
  const statusRows = [
    { key: 'open', label: 'Open', value: open, tone: 'open' },
    { key: 'progress', label: 'In progress', value: inProgress, tone: 'progress' },
    { key: 'resolved', label: 'Resolved', value: resolved, tone: 'resolved' },
  ];

  const eligibleRate = pct(m.eligibleContacts, m.citizens);
  const resolutionRate = pct(m.resolvedComplaints, m.complaints);
  const handoffRate = pct(m.failedSessions, m.simulatedSessions);

  const stats = [
    {
      key: 'citizens',
      label: 'Total citizens',
      value: m.citizens,
      foot: 'Active records',
      icon: Users,
    },
    {
      key: 'eligibleContacts',
      label: 'Eligible contacts',
      value: m.eligibleContacts,
      foot: eligibleRate === null ? 'Consented & reachable' : `${eligibleRate}% of citizens`,
      icon: ShieldCheck,
    },
    {
      key: 'complaints',
      label: 'Total complaints',
      value: m.complaints,
      foot: typeof m.newComplaints === 'number' ? `+${fmt(m.newComplaints)} today` : 'All time',
      icon: FileText,
    },
    {
      key: 'inProgress',
      label: 'In progress',
      value: m.inProgressComplaints,
      foot: 'Including reopened',
      icon: Activity,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      value: m.resolvedComplaints,
      foot: resolutionRate === null ? 'Resolved or closed' : `${resolutionRate}% resolution rate`,
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div>
          <h1>Overview</h1>
          <p>
            {greeting}, {user?.name.split(' ')[0]} · {today}
          </p>
        </div>
        <div className="page-header-actions">
          {canSee('citizens:read') && (
            <Link to="/citizens" className="btn btn-secondary">
              <Users size={16} /> Citizens
            </Link>
          )}
          {canSee('campaigns:manage') && (
            <Link to="/campaigns" className="btn btn-secondary">
              <Megaphone size={16} /> New campaign
            </Link>
          )}
          {canSee('sessions:run') && (
            <Link to="/studio" className="btn btn-secondary">
              <Radio size={16} /> Start test session
            </Link>
          )}
          {canSee('complaints:read') && (
            <Link to="/complaints" className="btn btn-primary">
              <ClipboardList size={16} /> View complaints
            </Link>
          )}
        </div>
      </header>

      {isError && (
        <div className="inline-error" role="alert">
          <CircleAlert size={18} />
          <span>
            <strong>Dashboard data could not be loaded.</strong> Check that the API server is
            running, then try again.
          </span>
          <button
            type="button"
            className="inline-error-action"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={15} className={isFetching ? 'spin-icon' : undefined} />
            Retry
          </button>
        </div>
      )}

      <section className="stats-grid" aria-label="Organization metrics">
        {stats.map(({ key, label, value, foot, icon: Icon }) => (
          <article className="stat-card" key={key}>
            <div className="stat-top">
              <span className="stat-label">{label}</span>
              <Icon size={17} className="stat-icon" />
            </div>
            <div className="stat-value">
              {isLoading ? <span className="skeleton skeleton-number" /> : fmt(value)}
            </div>
            <div className="stat-foot">{foot}</div>
          </article>
        ))}
      </section>

      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Complaint status</h2>
              <p>Breakdown of all complaints by status</p>
            </div>
            {canSee('complaints:read') && (
              <Link to="/complaints" className="text-link">
                View all
              </Link>
            )}
          </div>
          <div className="status-bar" aria-hidden="true">
            {total > 0 ? (
              statusRows
                .filter((row) => row.value > 0)
                .map((row) => (
                  <span
                    key={row.key}
                    className={`seg-${row.tone}`}
                    style={{ flexGrow: row.value }}
                  />
                ))
            ) : (
              <span className="seg-empty" />
            )}
          </div>
          <ul className="metric-list">
            {statusRows.map((row) => (
              <li key={row.key}>
                <span className={`dot seg-${row.tone}`} />
                <span className="metric-name">{row.label}</span>
                <span className="metric-value">{isLoading ? '…' : fmt(row.value)}</span>
                <span className="metric-share">
                  {total > 0 ? `${Math.round((row.value / total) * 100)}%` : '0%'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Outreach readiness</h2>
              <p>Contactability and AI session activity</p>
            </div>
          </div>
          <div className="readiness">
            <div className="readiness-head">
              <span>Eligible for outreach</span>
              <strong>{eligibleRate === null ? '—' : `${eligibleRate}%`}</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${eligibleRate ?? 0}%` }} />
            </div>
            <small>
              {fmt(m.eligibleContacts)} of {fmt(m.citizens)} citizens have consent and a valid phone
              number
            </small>
          </div>
          <ul className="metric-list">
            <li>
              <Activity size={16} className="metric-icon" />
              <span className="metric-name">Simulated sessions</span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.simulatedSessions)}</span>
              <span className="metric-share" />
            </li>
            <li>
              <PhoneForwarded size={16} className="metric-icon" />
              <span className="metric-name">Handed off to staff</span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.failedSessions)}</span>
              <span className="metric-share">{handoffRate === null ? '' : `${handoffRate}%`}</span>
            </li>
            <li>
              <CheckCircle2 size={16} className="metric-icon" />
              <span className="metric-name">Sessions finished</span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.completedSessions)}</span>
              <span className="metric-share" />
            </li>
            <li>
              <ClipboardList size={16} className="metric-icon" />
              <span className="metric-name">Complaints awaiting review</span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.pendingReview)}</span>
              <span className="metric-share" />
            </li>
            <li>
              <Megaphone size={16} className="metric-icon" />
              <span className="metric-name">
                {canSee('campaigns:manage') ? (
                  <Link to="/campaigns">Live campaigns</Link>
                ) : (
                  'Live campaigns'
                )}
              </span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.liveCampaigns)}</span>
              <span className="metric-share" />
            </li>
            <li>
              <FileText size={16} className="metric-icon" />
              <span className="metric-name">New complaints today</span>
              <span className="metric-value">{isLoading ? '…' : fmt(m.newComplaints)}</span>
              <span className="metric-share" />
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
