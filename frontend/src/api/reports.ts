import { ApiError, apiRequest } from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1';

export interface ReportMeta {
  from: string;
  to: string;
  utcOffset: string;
  scope: 'organization' | 'assigned';
  generatedAt: string;
}
export interface Report<T> {
  data: T;
  meta: ReportMeta;
}
export interface KeyCount {
  key: string;
  count: number;
}
export interface Overview {
  complaints: number;
  complaintsFromAiSessions: number;
  awaitingReview: number;
  resolved: number;
  sessions: number;
  sessionsWithComplaint: number;
  handoffs: number;
  liveCampaigns: number;
}
export interface SessionReport {
  total: number;
  outcomes: KeyCount[];
  languages: KeyCount[];
  channels: KeyCount[];
  averageDurationSeconds: number | null;
}
export interface CampaignRow {
  id: number;
  name: string;
  status: string;
  eligible: number;
  completed: number;
  failed: number;
  pending: number;
  completionRate: number | null;
}

const get = <T>(path: string, range: string) => apiRequest<Report<T>>(`/reports/${path}?${range}`);

export const reportsApi = {
  overview: (range: string) => get<Overview>('overview', range),
  byStatus: (range: string) => get<KeyCount[]>('complaints-by-status', range),
  byCategory: (range: string) => get<KeyCount[]>('complaints-by-category', range),
  byWard: (range: string) => get<KeyCount[]>('complaints-by-ward', range),
  overTime: (range: string) =>
    get<Array<{ day: string; count: number }>>('complaints-over-time', range),
  sessions: (range: string) => get<SessionReport>('sessions', range),
  campaigns: (range: string) => get<CampaignRow[]>('campaigns', range),
  /** Downloads the scoped complaint CSV through the authenticated session. */
  exportComplaints: async (range: string) => {
    const response = await fetch(`${API_BASE}/reports/export/complaints.csv?${range}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new ApiError(body.error?.message ?? 'Export failed.', response.status);
    }
    const name =
      /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ??
      'complaints.csv';
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  },
};
