import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Download, LoaderCircle } from 'lucide-react';
import { reportsApi, type KeyCount, type ReportMeta } from '../api/reports';
import { languageLabels, outcomeLabels, type Language, type SessionOutcome } from '../api/sessions';
import { statusLabels, type ComplaintStatus } from './ComplaintsPage';
import {
  BarList,
  ChartCard,
  DataTable,
  TrendChart,
  formatCount,
  type BarRow,
} from '../components/charts/Charts';

type Preset = 7 | 30 | 90;

/** Local (browser) calendar date, YYYY-MM-DD. */
function isoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function presetRange(days: Preset) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: isoDate(from), to: isoDate(to) };
}

const otherLabels: Record<string, string> = {
  none: 'Not recorded',
  Other: 'Other',
  in_progress: 'Still in progress',
  not_chosen: 'Language not chosen',
  text: 'Text',
  voice: 'Voice',
};

function toRows(items: KeyCount[] | undefined, label: (key: string) => string): BarRow[] {
  return (items ?? []).map((item) => ({
    key: item.key,
    label: label(item.key),
    value: item.count,
  }));
}
const statusLabel = (key: string) =>
  statusLabels[key as ComplaintStatus] ?? otherLabels[key] ?? key;
const outcomeLabel = (key: string) =>
  outcomeLabels[key as SessionOutcome] ?? otherLabels[key] ?? key;
const languageLabel = (key: string) => languageLabels[key as Language] ?? otherLabels[key] ?? key;
const plainLabel = (key: string) => otherLabels[key] ?? key;
const wardLabel = (key: string) =>
  key === 'none' ? 'Ward not recorded' : key === 'Other' ? 'Other wards' : `Ward ${key}`;

function rowsTable(rows: BarRow[], name: string) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <DataTable
      columns={[name, 'Count', 'Share']}
      rows={rows.map((row) => [
        row.label,
        row.value,
        total ? `${Math.round((row.value / total) * 100)}%` : '—',
      ])}
    />
  );
}

function Freshness({ meta, fetching }: { meta?: ReportMeta; fetching: boolean }) {
  if (!meta) return null;
  const range = `${new Date(`${meta.from}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', dateStyle: 'medium' })} – ${new Date(`${meta.to}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', dateStyle: 'medium' })}`;
  return (
    <p className="report-freshness" aria-live="polite">
      {fetching ? (
        <>
          <LoaderCircle size={12} className="spin-icon" /> Updating…
        </>
      ) : (
        <>
          Updated {new Date(meta.generatedAt).toLocaleTimeString('en-IN', { timeStyle: 'short' })}
        </>
      )}{' '}
      · {range} (UTC{meta.utcOffset}) ·{' '}
      {meta.scope === 'organization' ? 'Whole organization' : 'Only complaints assigned to you'}
    </p>
  );
}

function Stat({ label, value, foot }: { label: string; value: number | undefined; foot?: string }) {
  return (
    <article className="report-stat">
      <span>{label}</span>
      <strong>{value === undefined ? '—' : formatCount(value)}</strong>
      {foot && <small>{foot}</small>}
    </article>
  );
}

export function ReportsPage() {
  const [preset, setPreset] = useState<Preset | 'custom'>(30);
  const [custom, setCustom] = useState(() => presetRange(30));
  const range = preset === 'custom' ? custom : presetRange(preset);
  const query = useMemo(
    () => new URLSearchParams({ from: range.from, to: range.to }).toString(),
    [range.from, range.to],
  );
  const validRange = range.from <= range.to;

  const options = { placeholderData: keepPreviousData, enabled: validRange } as const;
  const overview = useQuery({
    queryKey: ['report', 'overview', query],
    queryFn: () => reportsApi.overview(query),
    ...options,
  });
  const overTime = useQuery({
    queryKey: ['report', 'time', query],
    queryFn: () => reportsApi.overTime(query),
    ...options,
  });
  const byStatus = useQuery({
    queryKey: ['report', 'status', query],
    queryFn: () => reportsApi.byStatus(query),
    ...options,
  });
  const byCategory = useQuery({
    queryKey: ['report', 'category', query],
    queryFn: () => reportsApi.byCategory(query),
    ...options,
  });
  const byWard = useQuery({
    queryKey: ['report', 'ward', query],
    queryFn: () => reportsApi.byWard(query),
    ...options,
  });
  const sessions = useQuery({
    queryKey: ['report', 'sessions', query],
    queryFn: () => reportsApi.sessions(query),
    ...options,
  });
  const campaigns = useQuery({
    queryKey: ['report', 'campaigns', query],
    queryFn: () => reportsApi.campaigns(query),
    ...options,
  });
  const exportCsv = useMutation({ mutationFn: () => reportsApi.exportComplaints(query) });

  const all = [overview, overTime, byStatus, byCategory, byWard, sessions, campaigns];
  const fetching = all.some((item) => item.isFetching);
  const failed = all.find((item) => item.isError);
  const o = overview.data?.data;
  const statusRows = toRows(byStatus.data?.data, statusLabel);
  const categoryRows = toRows(byCategory.data?.data, plainLabel);
  const wardRows = toRows(byWard.data?.data, wardLabel);
  const outcomeRows = toRows(sessions.data?.data.outcomes, outcomeLabel);
  const languageRows = toRows(sessions.data?.data.languages, languageLabel);
  const campaignRows: BarRow[] = (campaigns.data?.data ?? [])
    .filter((row) => row.completionRate !== null)
    .map((row) => ({ key: String(row.id), label: row.name, value: row.completionRate ?? 0 }));
  const points = overTime.data?.data ?? [];

  return (
    <div className="complaints-page reports-page">
      <div className="complaints-heading">
        <div>
          <div className="eyebrow dashboard-eyebrow">ANALYTICS</div>
          <h1>Reports</h1>
          <p>
            Complaint, session and campaign figures, computed on the server for the chosen dates.
          </p>
        </div>
      </div>

      <div className="report-filters" role="group" aria-label="Report filters">
        <div className="report-presets" role="radiogroup" aria-label="Date range">
          {([7, 30, 90] as Preset[]).map((days) => (
            <button
              key={days}
              role="radio"
              aria-checked={preset === days}
              className={preset === days ? 'active' : ''}
              onClick={() => setPreset(days)}
            >
              Last {days} days
            </button>
          ))}
          <button
            role="radio"
            aria-checked={preset === 'custom'}
            className={preset === 'custom' ? 'active' : ''}
            onClick={() => {
              setCustom(range);
              setPreset('custom');
            }}
          >
            Custom
          </button>
        </div>
        {preset === 'custom' && (
          <div className="report-custom">
            <label>
              From
              <input
                type="date"
                value={custom.from}
                max={custom.to}
                onChange={(event) => setCustom({ ...custom, from: event.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={custom.to}
                min={custom.from}
                onChange={(event) => setCustom({ ...custom, to: event.target.value })}
              />
            </label>
          </div>
        )}
        <button
          className="secondary-button report-export"
          disabled={exportCsv.isPending || !validRange}
          onClick={() => exportCsv.mutate()}
        >
          {exportCsv.isPending ? (
            <LoaderCircle size={14} className="spin-icon" />
          ) : (
            <Download size={14} />
          )}
          Export complaints (CSV)
        </button>
      </div>
      <Freshness meta={overview.data?.meta} fetching={fetching} />
      {!validRange && (
        <div className="form-error">The start date must be on or before the end date.</div>
      )}
      {(failed || exportCsv.isError) && (
        <div className="form-error" role="alert">
          <AlertCircle size={14} />{' '}
          {(failed?.error ?? exportCsv.error) instanceof Error
            ? (failed?.error ?? exportCsv.error)!.message
            : 'Some report data could not be loaded.'}
        </div>
      )}

      <div className={`report-body ${fetching ? 'refreshing' : ''}`}>
        <section className="report-stats" aria-label="Key figures">
          <Stat
            label="Complaints registered"
            value={o?.complaints}
            foot={o ? `${formatCount(o.complaintsFromAiSessions)} from AI sessions` : undefined}
          />
          <Stat label="Awaiting review" value={o?.awaitingReview} foot="Status: registered" />
          <Stat label="Resolved or closed" value={o?.resolved} />
          <Stat
            label="AI sessions"
            value={o?.sessions}
            foot={o ? `${formatCount(o.sessionsWithComplaint)} created a complaint` : undefined}
          />
          <Stat label="Needed staff follow-up" value={o?.handoffs} foot="Sessions handed off" />
        </section>

        <div className="report-grid">
          <ChartCard
            wide
            title="Complaints over time"
            subtitle="Complaints registered per day"
            table={
              <DataTable
                columns={['Day', 'Complaints']}
                rows={points.map((point) => [point.day, point.count])}
              />
            }
          >
            <TrendChart points={points} label="Complaints registered" />
          </ChartCard>
          <ChartCard
            title="Complaints by status"
            subtitle="Current status of complaints registered in the range"
            table={rowsTable(statusRows, 'Status')}
          >
            <BarList rows={statusRows} />
          </ChartCard>
          <ChartCard
            title="Complaints by category"
            subtitle="Top 8 categories; the rest folded into Other"
            table={rowsTable(categoryRows, 'Category')}
          >
            <BarList rows={categoryRows} />
          </ChartCard>
          <ChartCard
            title="Complaints by ward"
            subtitle="Top 10 wards; the rest folded into Other"
            table={rowsTable(wardRows, 'Ward')}
          >
            <BarList rows={wardRows} />
          </ChartCard>
          <ChartCard
            title="Session outcomes"
            subtitle={
              sessions.data?.data.averageDurationSeconds != null
                ? `Average finished session: ${Math.round(sessions.data.data.averageDurationSeconds / 60)} min ${sessions.data.data.averageDurationSeconds % 60} s`
                : 'How AI sessions ended'
            }
            table={rowsTable(outcomeRows, 'Outcome')}
          >
            <BarList rows={outcomeRows} />
          </ChartCard>
          <ChartCard
            title="Session languages"
            subtitle="Language each session was held in"
            table={rowsTable(languageRows, 'Language')}
          >
            <BarList rows={languageRows} />
          </ChartCard>
          <ChartCard
            title="Campaign completion"
            subtitle="Share of each campaign's eligible recipients that have been worked"
            table={
              <DataTable
                columns={[
                  'Campaign',
                  'Status',
                  'Eligible',
                  'Completed',
                  'Failed',
                  'Waiting',
                  'Done',
                ]}
                rows={(campaigns.data?.data ?? []).map((row) => [
                  row.name,
                  row.status,
                  row.eligible,
                  row.completed,
                  row.failed,
                  row.pending,
                  row.completionRate === null ? '—' : `${row.completionRate}%`,
                ])}
              />
            }
          >
            <BarList
              rows={campaignRows}
              unit="%"
              max={100}
              showShare={false}
              emptyText="No campaigns in this range."
            />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
