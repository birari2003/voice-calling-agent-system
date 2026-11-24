import type { ExclusionReason } from '../models/index.js';

/** Fields that decide whether a citizen may be included in a campaign. */
export interface EligibilityFacts {
  isActive: boolean;
  optedOut: boolean;
  phone: string | null;
  contactAuthorized: boolean;
  consentSource: string | null;
  consentRecordedAt: Date | null;
  /** Already pending or in progress in another live campaign. */
  inAnotherLiveCampaign: boolean;
}

const VALID_PHONE = /^\+91[6-9]\d{9}$/;

/**
 * Returns why a citizen must be excluded, or null if eligible. Checks run in a fixed order so
 * each citizen gets one clear reason. The same rules apply in simulation as in real calling:
 * documented authorization and consent are required, and opt-outs are always respected.
 */
export function exclusionReason(facts: EligibilityFacts): ExclusionReason | null {
  if (!facts.isActive) return 'inactive';
  if (facts.optedOut) return 'opted_out';
  if (!facts.phone || !VALID_PHONE.test(facts.phone)) return 'invalid_number';
  if (!facts.contactAuthorized || !facts.consentSource || !facts.consentRecordedAt)
    return 'missing_authorization';
  if (facts.inAnotherLiveCampaign) return 'duplicate';
  return null;
}

export type SessionOutcomeForRecipient =
  | 'complaint_created'
  | 'cancelled_by_citizen'
  | 'cancelled_by_staff'
  | 'handoff'
  | 'ended_without_complaint';

/**
 * Recipient status after a session ends. A conversation that reached the citizen counts as
 * completed whatever they chose; a staff-aborted test may be retried only within the
 * campaign's conservative attempt limit and only while the campaign is live.
 */
export function recipientStatusAfterSession(
  outcome: SessionOutcomeForRecipient,
  attemptCount: number,
  maxAttempts: number,
  campaignLive: boolean,
): 'pending' | 'completed' | 'failed' | 'skipped' {
  if (outcome === 'handoff') return 'failed';
  if (outcome !== 'cancelled_by_staff') return 'completed';
  if (!campaignLive) return 'skipped';
  return attemptCount < maxAttempts ? 'pending' : 'failed';
}
