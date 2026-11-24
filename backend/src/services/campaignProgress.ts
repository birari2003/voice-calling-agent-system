import type { Transaction } from 'sequelize';
import { CallSession, Campaign, CampaignRecipient, type SessionOutcome } from '../models/index.js';
import { recipientStatusAfterSession } from './campaignEligibility.js';

/**
 * Updates the campaign recipient a session was run for, inside the session's transaction, and
 * completes the campaign once nobody is pending or in progress.
 */
export async function recordCampaignSessionEnded(
  session: CallSession,
  outcome: SessionOutcome,
  transaction: Transaction,
): Promise<void> {
  if (!session.campaignRecipientId || !session.campaignId) return;
  const recipient = await CampaignRecipient.findByPk(session.campaignRecipientId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const campaign = await Campaign.findByPk(session.campaignId, { transaction });
  if (!recipient || !campaign || recipient.status !== 'in_progress') return;
  const live = campaign.status === 'running' || campaign.status === 'paused';
  recipient.status = recipientStatusAfterSession(
    outcome,
    recipient.attemptCount,
    campaign.maxAttempts,
    live,
  );
  recipient.lastSessionId = session.id;
  await recipient.save({ transaction });
  await completeCampaignIfDone(campaign, transaction);
}

export async function completeCampaignIfDone(
  campaign: Campaign,
  transaction?: Transaction,
): Promise<boolean> {
  if (campaign.status !== 'running') return false;
  const open = await CampaignRecipient.count({
    where: { campaignId: campaign.id, status: ['pending', 'in_progress'] },
    transaction,
  });
  if (open > 0) return false;
  campaign.status = 'completed';
  campaign.completedAt = new Date();
  await campaign.save({ transaction });
  return true;
}
