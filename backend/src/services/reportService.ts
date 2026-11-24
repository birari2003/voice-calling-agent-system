import { Op, type WhereOptions } from 'sequelize';
import { sequelize } from '../config/database.js';
import { CallSession, Campaign, CampaignRecipient, Complaint } from '../models/index.js';
import type { AuthenticatedUser } from './authService.js';
import { daysInRange, type ReportRange } from './reportRange.js';

type CountRow = { key: string | null; count: number | string };

/**
 * Complaints the user may see in reports: same rules as the complaint list, so aggregates and
 * exports never reveal more than the user could open (assigned only, unless read_all).
 */
export function complaintScope(user: AuthenticatedUser, range: ReportRange): WhereOptions {
  return {
    organizationId: user.organizationId,
    archivedAt: null,
    createdAt: { [Op.between]: [range.start, range.end] },
    ...(user.permissions.includes('complaints:read_all') ? {} : { assignedTo: user.id }),
  };
}

export function reportScope(user: AuthenticatedUser): 'organization' | 'assigned' {
  return user.permissions.includes('complaints:read_all') ? 'organization' : 'assigned';
}

async function countBy(
  model: typeof Complaint | typeof CallSession,
  column: string,
  where: WhereOptions,
): Promise<Array<{ key: string; count: number }>> {
  const rows = (await (model as typeof Complaint).findAll({
    where,
    attributes: [
      [sequelize.col(column), 'key'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: [column],
    raw: true,
  })) as unknown as CountRow[];
  return rows
    .map((row) => ({ key: row.key ?? 'none', count: Number(row.count) }))
    .sort((a, b) => b.count - a.count);
}

/** Keeps the largest `limit` groups and folds the rest into "Other". */
function topWithOther(rows: Array<{ key: string; count: number }>, limit: number) {
  if (rows.length <= limit) return rows;
  const other = rows.slice(limit).reduce((sum, row) => sum + row.count, 0);
  return [...rows.slice(0, limit), { key: 'Other', count: other }];
}

export async function complaintsByStatus(user: AuthenticatedUser, range: ReportRange) {
  return countBy(Complaint, 'status', complaintScope(user, range));
}

export async function complaintsByCategory(user: AuthenticatedUser, range: ReportRange) {
  return topWithOther(await countBy(Complaint, 'category', complaintScope(user, range)), 8);
}

export async function complaintsByWard(user: AuthenticatedUser, range: ReportRange) {
  return topWithOther(await countBy(Complaint, 'ward', complaintScope(user, range)), 10);
}

export async function complaintsOverTime(user: AuthenticatedUser, range: ReportRange) {
  // The offset is validated by the env schema (e.g. +05:30), so it is safe in the literal.
  const localDay = sequelize.literal(
    `DATE(CONVERT_TZ(\`created_at\`, '+00:00', '${range.utcOffset}'))`,
  );
  const rows = (await Complaint.findAll({
    where: complaintScope(user, range),
    attributes: [
      [localDay, 'day'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: [localDay as unknown as string],
    raw: true,
  })) as unknown as Array<{ day: string | Date; count: number | string }>;
  const byDay = new Map(
    rows.map((row) => [
      row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      Number(row.count),
    ]),
  );
  return daysInRange(range).map((day) => ({ day, count: byDay.get(day) ?? 0 }));
}

function sessionScope(user: AuthenticatedUser, range: ReportRange): WhereOptions {
  return {
    organizationId: user.organizationId,
    startedAt: { [Op.between]: [range.start, range.end] },
  };
}

export async function sessionReport(user: AuthenticatedUser, range: ReportRange) {
  const where = sessionScope(user, range);
  const [outcomes, languages, channels, average] = await Promise.all([
    countBy(CallSession, 'outcome', where),
    countBy(CallSession, 'language', where),
    countBy(CallSession, 'channel', where),
    CallSession.findOne({
      where: { ...where, status: 'ended' },
      attributes: [[sequelize.fn('AVG', sequelize.col('duration_seconds')), 'average']],
      raw: true,
    }) as unknown as Promise<{ average: string | number | null } | null>,
  ]);
  const total = outcomes.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    outcomes: outcomes.map((row) => ({
      ...row,
      key: row.key === 'none' ? 'in_progress' : row.key,
    })),
    languages: languages.map((row) => ({
      ...row,
      key: row.key === 'none' ? 'not_chosen' : row.key,
    })),
    channels,
    averageDurationSeconds: average?.average == null ? null : Math.round(Number(average.average)),
  };
}

/** Campaigns active during the range, with how much of each eligible list has been worked. */
export async function campaignReport(user: AuthenticatedUser, range: ReportRange) {
  const campaigns = await Campaign.findAll({
    where: {
      organizationId: user.organizationId,
      status: { [Op.ne]: 'draft' },
      createdAt: { [Op.lte]: range.end },
      [Op.or]: [{ completedAt: null }, { completedAt: { [Op.gte]: range.start } }],
    },
    attributes: ['id', 'name', 'status', 'startedAt', 'completedAt'],
    order: [['createdAt', 'DESC']],
    limit: 50,
  });
  const ids = campaigns.map(({ id }) => id);
  const rows = ids.length
    ? ((await CampaignRecipient.findAll({
        where: { campaignId: ids, exclusionReason: null },
        attributes: ['campaignId', 'status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['campaignId', 'status'],
        raw: true,
      })) as unknown as Array<{ campaignId: number; status: string; count: number | string }>)
    : [];
  return campaigns.map((campaign) => {
    const counts: Record<string, number> = {};
    for (const row of rows.filter(({ campaignId }) => campaignId === campaign.id))
      counts[row.status] = Number(row.count);
    const eligible = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const finished =
      (counts.completed ?? 0) +
      (counts.failed ?? 0) +
      (counts.skipped ?? 0) +
      (counts.opted_out ?? 0);
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      eligible,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      pending: (counts.pending ?? 0) + (counts.in_progress ?? 0),
      completionRate: eligible ? Math.round((finished / eligible) * 100) : null,
    };
  });
}

export async function overviewReport(user: AuthenticatedUser, range: ReportRange) {
  const complaints = complaintScope(user, range);
  const sessions = sessionScope(user, range);
  const [
    complaintTotal,
    viaAiSessions,
    awaitingReview,
    resolved,
    sessionTotal,
    sessionsWithComplaint,
    handoffs,
    liveCampaigns,
  ] = await Promise.all([
    Complaint.count({ where: complaints }),
    Complaint.count({ where: { ...complaints, source: 'simulated_ai' } as WhereOptions }),
    Complaint.count({ where: { ...complaints, status: 'registered' } as WhereOptions }),
    Complaint.count({
      where: { ...complaints, status: ['resolved', 'closed'] } as WhereOptions,
    }),
    CallSession.count({ where: sessions }),
    CallSession.count({ where: { ...sessions, outcome: 'complaint_created' } as WhereOptions }),
    CallSession.count({ where: { ...sessions, outcome: 'handoff' } as WhereOptions }),
    Campaign.count({
      where: { organizationId: user.organizationId, status: ['running', 'paused'] },
    }),
  ]);
  return {
    complaints: complaintTotal,
    complaintsFromAiSessions: viaAiSessions,
    awaitingReview,
    resolved,
    sessions: sessionTotal,
    sessionsWithComplaint,
    handoffs,
    liveCampaigns,
  };
}

/** Complaint rows for CSV export: same scope as the reports, and no citizen contact details. */
export async function complaintExportRows(user: AuthenticatedUser, range: ReportRange) {
  return Complaint.findAll({
    where: complaintScope(user, range),
    attributes: [
      'ticketId',
      'createdAt',
      'status',
      'priority',
      'category',
      'locality',
      'ward',
      'source',
      'assignedDepartment',
    ],
    order: [['createdAt', 'ASC']],
    limit: 50000,
  });
}
