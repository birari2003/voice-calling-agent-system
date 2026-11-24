import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { writeAuditLog } from '../services/auditService.js';
import { ReportRangeError, resolveRange, type ReportRange } from '../services/reportRange.js';
import {
  campaignReport,
  complaintExportRows,
  complaintsByCategory,
  complaintsByStatus,
  complaintsByWard,
  complaintsOverTime,
  overviewReport,
  reportScope,
  sessionReport,
} from '../services/reportService.js';
import type { AuthenticatedUser } from '../services/authService.js';
import { csvCell } from '../utils/csv.js';

const rangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function parseRange(request: Request, response: Response): ReportRange | null {
  const parsed = rangeSchema.safeParse(request.query);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Dates must be YYYY-MM-DD.' } });
    return null;
  }
  try {
    return resolveRange(parsed.data.from, parsed.data.to, env.REPORT_UTC_OFFSET);
  } catch (error) {
    if (error instanceof ReportRangeError) {
      response.status(400).json({ error: { code: 'INVALID_RANGE', message: error.message } });
      return null;
    }
    throw error;
  }
}

/** Every report response says which slice it covers and when it was computed. */
function report<T>(build: (user: AuthenticatedUser, range: ReportRange) => Promise<T>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const range = parseRange(request, response);
    if (!range) return;
    try {
      const data = await build(request.authUser!, range);
      response.json({
        data,
        meta: {
          from: range.from,
          to: range.to,
          utcOffset: range.utcOffset,
          scope: reportScope(request.authUser!),
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const overviewHandler = report(overviewReport);
export const byStatusHandler = report(complaintsByStatus);
export const byCategoryHandler = report(complaintsByCategory);
export const byWardHandler = report(complaintsByWard);
export const overTimeHandler = report(complaintsOverTime);
export const sessionsHandler = report(sessionReport);
export const campaignsHandler = report(campaignReport);

export async function exportComplaintsHandler(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const range = parseRange(request, response);
  if (!range) return;
  try {
    const rows = await complaintExportRows(request.authUser!, range);
    const fields = [
      ['ticketId', 'Ticket'],
      ['createdAt', 'Registered (UTC)'],
      ['status', 'Status'],
      ['priority', 'Priority'],
      ['category', 'Category'],
      ['locality', 'Locality'],
      ['ward', 'Ward'],
      ['source', 'Source'],
      ['assignedDepartment', 'Department'],
    ] as const;
    const lines = [fields.map(([, label]) => csvCell(label)).join(',')];
    for (const row of rows) lines.push(fields.map(([field]) => csvCell(row.get(field))).join(','));
    await writeAuditLog('report.complaints_exported', request.authUser!.id, {
      from: range.from,
      to: range.to,
      rows: rows.length,
      scope: reportScope(request.authUser!),
    });
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="complaints-${range.from}-to-${range.to}.csv"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(`﻿${lines.join('\r\n')}\r\n`);
  } catch (error) {
    next(error);
  }
}
