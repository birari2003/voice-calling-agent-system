import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  exclusionReason,
  recipientStatusAfterSession,
  type EligibilityFacts,
} from '../src/services/campaignEligibility.js';
import { daysInRange, localDate, resolveRange } from '../src/services/reportRange.js';
import { csvCell } from '../src/utils/csv.js';

const eligible: EligibilityFacts = {
  isActive: true,
  optedOut: false,
  phone: '+919812345678',
  contactAuthorized: true,
  consentSource: 'Ward office form',
  consentRecordedAt: new Date('2026-11-01'),
  inAnotherLiveCampaign: false,
};

describe('campaign eligibility', () => {
  it('accepts an active, consented, reachable citizen', () => {
    assert.equal(exclusionReason(eligible), null);
  });

  it('gives one clear reason per excluded citizen, in priority order', () => {
    assert.equal(exclusionReason({ ...eligible, isActive: false, optedOut: true }), 'inactive');
    assert.equal(exclusionReason({ ...eligible, optedOut: true }), 'opted_out');
    assert.equal(exclusionReason({ ...eligible, phone: null }), 'invalid_number');
    assert.equal(exclusionReason({ ...eligible, phone: '12345' }), 'invalid_number');
    assert.equal(
      exclusionReason({ ...eligible, contactAuthorized: false }),
      'missing_authorization',
    );
    assert.equal(exclusionReason({ ...eligible, consentSource: null }), 'missing_authorization');
    assert.equal(
      exclusionReason({ ...eligible, consentRecordedAt: null }),
      'missing_authorization',
    );
    assert.equal(exclusionReason({ ...eligible, inAnotherLiveCampaign: true }), 'duplicate');
  });

  it('treats authorization without recorded consent as not authorized', () => {
    // Uploading a phone list is not consent; both the flag and its evidence are required.
    assert.equal(
      exclusionReason({
        ...eligible,
        contactAuthorized: true,
        consentSource: null,
        consentRecordedAt: null,
      }),
      'missing_authorization',
    );
  });
});

describe('recipient status after a session', () => {
  it('completes any conversation that reached the citizen, whatever they chose', () => {
    for (const outcome of [
      'complaint_created',
      'cancelled_by_citizen',
      'ended_without_complaint',
    ] as const)
      assert.equal(recipientStatusAfterSession(outcome, 1, 1, true), 'completed', outcome);
  });

  it('marks hand-offs as failed', () => {
    assert.equal(recipientStatusAfterSession('handoff', 1, 3, true), 'failed');
  });

  it('retries a staff-aborted test only within the attempt limit', () => {
    assert.equal(recipientStatusAfterSession('cancelled_by_staff', 1, 2, true), 'pending');
    assert.equal(recipientStatusAfterSession('cancelled_by_staff', 2, 2, true), 'failed');
    assert.equal(recipientStatusAfterSession('cancelled_by_staff', 1, 1, true), 'failed');
  });

  it('never re-queues anyone once the campaign is no longer live', () => {
    assert.equal(recipientStatusAfterSession('cancelled_by_staff', 1, 3, false), 'skipped');
  });
});

describe('report date ranges', () => {
  const now = new Date('2026-11-20T20:00:00Z'); // 21 Nov 01:30 in India

  it('uses the local date, not the UTC date', () => {
    assert.equal(localDate(now, '+05:30'), '2026-11-21');
    assert.equal(localDate(now, '+00:00'), '2026-11-20');
  });

  it('defaults to the last 30 days including today', () => {
    const range = resolveRange(undefined, undefined, '+05:30', now);
    assert.equal(range.to, '2026-11-21');
    assert.equal(range.from, '2026-10-23');
    assert.equal(daysInRange(range).length, 30);
  });

  it('bounds the range by local midnight', () => {
    const range = resolveRange('2026-11-01', '2026-11-01', '+05:30', now);
    assert.equal(range.start.toISOString(), '2026-10-31T18:30:00.000Z');
    assert.equal(range.end.toISOString(), '2026-11-01T18:29:59.999Z');
    assert.deepEqual(daysInRange(range), ['2026-11-01']);
  });

  it('rejects reversed and oversized ranges', () => {
    assert.throws(() => resolveRange('2026-11-10', '2026-11-01', '+05:30', now));
    assert.throws(() => resolveRange('2024-01-01', '2026-11-01', '+05:30', now));
  });
});

describe('CSV export cells', () => {
  it('quotes values and neutralises spreadsheet formulas', () => {
    assert.equal(csvCell('Ward 5'), '"Ward 5"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(csvCell('+91 98'), '"\'+91 98"');
    assert.equal(csvCell(null), '""');
  });
});
