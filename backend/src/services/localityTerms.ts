import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { Citizen, Complaint } from '../models/index.js';

const CACHE_MS = 5 * 60 * 1000;
const MAX_TERMS = 50; // provider limit
const cache = new Map<number, { at: number; terms: string[] }>();

/**
 * The organization's most common locality names (from citizen records and complaints), used as
 * speech-recognition key terms while the citizen is giving a location, so local place names
 * such as "Ganeshguri" are recognised. Only names already in the organization's own records.
 */
export async function localityKeyterms(organizationId: number): Promise<string[]> {
  const cached = cache.get(organizationId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.terms;
  const counts = new Map<string, number>();
  for (const model of [Citizen, Complaint] as const) {
    const rows = (await (model as typeof Citizen).findAll({
      where: { organizationId, locality: { [Op.ne]: null } },
      attributes: ['locality', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['locality'],
      raw: true,
    })) as unknown as Array<{ locality: string; count: number | string }>;
    for (const { locality, count } of rows) {
      const term = locality.trim().slice(0, 64);
      if (term.length >= 2) counts.set(term, (counts.get(term) ?? 0) + Number(count));
    }
  }
  const terms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_TERMS)
    .map(([term]) => term);
  cache.set(organizationId, { at: Date.now(), terms });
  return terms;
}
