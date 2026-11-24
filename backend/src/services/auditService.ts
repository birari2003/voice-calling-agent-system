import { AuditLog } from '../models/index.js';

export async function writeAuditLog(
  action: string,
  userId: number | null,
  metadata: Record<string, unknown> | null = null,
): Promise<void> {
  await AuditLog.create({ userId, action, metadata, createdAt: new Date() });
}
