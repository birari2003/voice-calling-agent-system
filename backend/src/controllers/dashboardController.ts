import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { CallSession, Campaign, Citizen, Complaint } from '../models/index.js';

export async function getOverview(request: Request, response: Response): Promise<void> {
  const organizationId = request.authUser!.organizationId;
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const [
    citizens,
    eligibleContacts,
    complaints,
    newComplaints,
    inProgressComplaints,
    resolvedComplaints,
    simulatedSessions,
    failedSessions,
    completedSessions,
    pendingReview,
    liveCampaigns,
  ] = await Promise.all([
    Citizen.count({ where: { organizationId, isActive: true } }),
    Citizen.count({
      where: {
        organizationId,
        isActive: true,
        contactAuthorized: true,
        consentSource: { [Op.ne]: null },
        consentRecordedAt: { [Op.ne]: null },
        optedOut: false,
        phone: { [Op.ne]: null },
      },
    }),
    Complaint.count({ where: { organizationId, archivedAt: null } }),
    Complaint.count({
      where: { organizationId, archivedAt: null, createdAt: { [Op.gte]: midnight } },
    }),
    Complaint.count({
      where: { organizationId, archivedAt: null, status: { [Op.in]: ['in_progress', 'reopened'] } },
    }),
    Complaint.count({
      where: { organizationId, archivedAt: null, status: { [Op.in]: ['resolved', 'closed'] } },
    }),
    CallSession.count({ where: { organizationId, mode: 'simulation' } }),
    CallSession.count({ where: { organizationId, outcome: 'handoff' } }),
    CallSession.count({ where: { organizationId, mode: 'simulation', status: 'ended' } }),
    // Newly registered complaints that no staff member has acknowledged or picked up yet.
    Complaint.count({ where: { organizationId, archivedAt: null, status: 'registered' } }),
    Campaign.count({ where: { organizationId, status: ['running', 'paused'] } }),
  ]);
  response.json({
    organization: {
      id: request.authUser?.organizationId,
      name: request.authUser?.organizationName,
    },
    phase: 'campaigns-and-reports',
    metrics: {
      citizens,
      eligibleContacts,
      complaints,
      newComplaints,
      inProgressComplaints,
      resolvedComplaints,
      simulatedSessions,
      completedSessions,
      failedSessions,
      pendingReview,
      liveCampaigns,
    },
    message:
      'Dashboard metrics will be available as citizen, complaint, and session modules are implemented.',
  });
}
