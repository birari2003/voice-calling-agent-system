import { ApiError, apiRequest } from './client';
import type { Language, SessionOutcome } from './sessions';

export type CampaignStatus =
  'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
export type RecipientStatus =
  'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'opted_out';
export type ExclusionReason =
  'opted_out' | 'inactive' | 'missing_authorization' | 'invalid_number' | 'duplicate';

export interface TargetFilter {
  wards?: string[];
  locality?: string;
  language?: Language;
}

export interface Campaign {
  id: number;
  name: string;
  description: string | null;
  status: CampaignStatus;
  defaultLanguage: Language | null;
  channel: 'text' | 'voice';
  targetFilter: TargetFilter;
  maxAttempts: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  creator?: { id: number; name: string } | null;
  recipientCounts: Partial<Record<RecipientStatus, number>>;
  exclusionCounts?: Partial<Record<ExclusionReason, number>>;
}

export interface Recipient {
  id: number;
  status: RecipientStatus;
  exclusionReason: ExclusionReason | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  citizen: {
    id: number;
    fullName: string | null;
    phone: string | null;
    ward: string | null;
    locality: string | null;
  } | null;
  lastSession: {
    id: string;
    status: string;
    outcome: SessionOutcome | null;
    complaintId: number | null;
  } | null;
}

export interface EligibilityPreview {
  campaignStatus: CampaignStatus;
  matched: number;
  eligible: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  maxRecipients: number;
  exceedsLimit: boolean;
}

export interface CampaignInput {
  name: string;
  description: string | null;
  defaultLanguage: Language | null;
  channel: 'text' | 'voice';
  targetFilter: TargetFilter;
  maxAttempts: number;
}

export const campaignStatusLabels: Record<CampaignStatus, string> = {
  draft: 'Draft',
  ready: 'Ready',
  running: 'Running',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Failed',
};
export const recipientStatusLabels: Record<RecipientStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
  opted_out: 'Opted out',
};
export const exclusionLabels: Record<ExclusionReason, string> = {
  opted_out: 'Opted out',
  inactive: 'Inactive record',
  missing_authorization: 'No documented consent',
  invalid_number: 'Missing or invalid number',
  duplicate: 'Already in another live campaign',
};

const post = <T>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export const campaignsApi = {
  list: (page: number) =>
    apiRequest<{ data: Campaign[]; pagination: { total: number; pages: number } }>(
      `/campaigns?page=${page}&limit=20`,
    ),
  get: (id: number) => apiRequest<{ data: Campaign }>(`/campaigns/${id}`),
  create: (input: CampaignInput) => post<{ data: Campaign }>('/campaigns', input),
  update: (id: number, input: Partial<CampaignInput>) =>
    apiRequest<{ data: Campaign }>(`/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  preview: (id: number) =>
    post<{ data: { preview: EligibilityPreview; campaign: Campaign } }>(
      `/campaigns/${id}/eligibility-preview`,
    ),
  action: (id: number, action: 'start-simulation' | 'pause' | 'resume' | 'cancel') =>
    post<{ data: Campaign }>(`/campaigns/${id}/${action}`),
  recipients: (id: number, page: number, status: string) =>
    apiRequest<{ data: Recipient[]; pagination: { total: number; pages: number } }>(
      `/campaigns/${id}/recipients?page=${page}&limit=25${status ? `&status=${status}` : ''}`,
    ),
  /** Returns the new session ID, or null when nobody is waiting. */
  nextSession: async (id: number): Promise<string | null> => {
    try {
      const result = await post<{ data: { sessionId: string } }>(`/campaigns/${id}/next-session`);
      return result.data.sessionId;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NO_PENDING_RECIPIENTS') return null;
      throw error;
    }
  },
};
