export interface ReportRange {
  /** Inclusive local dates, YYYY-MM-DD. */
  from: string;
  to: string;
  /** UTC instants bounding the range. */
  start: Date;
  end: Date;
  utcOffset: string;
}

export class ReportRangeError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;

function offsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  return sign * (hours! * 60 + minutes!);
}

/** Today's local date (YYYY-MM-DD) in the given UTC offset. */
export function localDate(instant: Date, utcOffset: string): string {
  return new Date(instant.getTime() + offsetMinutes(utcOffset) * 60_000).toISOString().slice(0, 10);
}

/**
 * Resolves a reporting window. Dates are local to the organization's UTC offset and inclusive;
 * the default is the last 30 days including today.
 */
export function resolveRange(
  from: string | undefined,
  to: string | undefined,
  utcOffset: string,
  now = new Date(),
): ReportRange {
  const toDate = to ?? localDate(now, utcOffset);
  const fromDate =
    from ?? new Date(Date.parse(`${toDate}T00:00:00Z`) - 29 * DAY_MS).toISOString().slice(0, 10);
  const start = new Date(`${fromDate}T00:00:00.000${utcOffset}`);
  const end = new Date(`${toDate}T23:59:59.999${utcOffset}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    throw new ReportRangeError('Dates must be in YYYY-MM-DD format.');
  if (start > end) throw new ReportRangeError('The start date must be on or before the end date.');
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_RANGE_DAYS)
    throw new ReportRangeError(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
  return { from: fromDate, to: toDate, start, end, utcOffset };
}

/** Every local date in the range, so days without data still appear as zero. */
export function daysInRange(range: ReportRange): string[] {
  const days: string[] = [];
  for (
    let cursor = Date.parse(`${range.from}T00:00:00Z`);
    cursor <= Date.parse(`${range.to}T00:00:00Z`);
    cursor += DAY_MS
  )
    days.push(new Date(cursor).toISOString().slice(0, 10));
  return days;
}
