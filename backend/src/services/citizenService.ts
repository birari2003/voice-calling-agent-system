import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import type { Express } from 'express';
import { z } from 'zod';
import { Citizen } from '../models/index.js';
import { writeAuditLog } from './auditService.js';

export type CitizenInput = {
  fullName?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  preferredLanguage?: 'as' | 'hi' | 'en';
  locality?: string | null;
  ward?: string | null;
  contactAuthorized?: boolean;
  consentSource?: string | null;
  optedOut?: boolean;
  notes?: string | null;
};

const inputSchema = z
  .object({
    fullName: z.string().trim().max(160).nullable().optional(),
    phone: z.string().nullable().optional(),
    whatsappNumber: z.string().nullable().optional(),
    preferredLanguage: z.enum(['as', 'hi', 'en']).default('as'),
    locality: z.string().trim().max(160).nullable().optional(),
    ward: z.string().trim().max(40).nullable().optional(),
    contactAuthorized: z.boolean().default(false),
    consentSource: z.string().trim().max(120).nullable().optional(),
    optedOut: z.boolean().default(false),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();

const importableFields = [
  'fullName',
  'phone',
  'whatsappNumber',
  'preferredLanguage',
  'locality',
  'ward',
  'contactAuthorized',
  'consentSource',
  'optedOut',
  'notes',
] as const;
export type ImportField = (typeof importableFields)[number];
export type ImportMapping = Partial<Record<ImportField, string>>;

const aliases: Record<ImportField, string[]> = {
  fullName: ['name', 'full name', 'full_name', 'citizen name', 'citizen_name'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'phone_number', 'mobile_number'],
  whatsappNumber: ['whatsapp', 'whatsapp number', 'whatsapp_number'],
  preferredLanguage: ['language', 'preferred language', 'preferred_language'],
  locality: ['locality', 'area', 'colony', 'locality area'],
  ward: ['ward', 'ward number', 'ward_number'],
  contactAuthorized: ['contact authorized', 'contact_authorized', 'consent', 'authorized'],
  consentSource: ['consent source', 'consent_source', 'authorization source'],
  optedOut: ['opted out', 'opted_out', 'do not contact', 'dnc'],
  notes: ['notes', 'note', 'remarks'],
};

export interface ImportRowResult {
  rowNumber: number;
  status: 'ready' | 'duplicate' | 'invalid';
  errors: string[];
  citizen?: CitizenInput;
}

export interface CitizenImportReview {
  headers: string[];
  suggestedMapping: ImportMapping;
  mapping: ImportMapping;
  summary: { total: number; ready: number; duplicates: number; invalid: number };
  rows: ImportRowResult[];
  privateRows: Array<{
    rowNumber: number;
    status: ImportRowResult['status'];
    citizen?: Record<string, unknown>;
  }>;
}

export class CitizenImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CitizenImportError';
  }
}

export function normalizeIndianPhone(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0091') && digits.length === 14) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(national)) {
    throw new Error('Enter a valid Indian mobile number (10 digits, optionally with +91).');
  }
  return `+91${national}`;
}

export function parseCitizenInput(raw: unknown): { data?: CitizenInput; errors: string[] } {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success)
    return {
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`,
      ),
    };
  try {
    const data = {
      ...parsed.data,
      fullName: parsed.data.fullName?.trim() || null,
      phone: normalizeIndianPhone(parsed.data.phone),
      whatsappNumber: normalizeIndianPhone(parsed.data.whatsappNumber),
      locality: parsed.data.locality?.trim() || null,
      ward: parsed.data.ward?.trim() || null,
      consentSource: parsed.data.consentSource?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
    };
    if (!data.fullName && !data.phone) return { errors: ['Provide a name or a phone number.'] };
    if (data.contactAuthorized && !data.consentSource) {
      return { errors: ['A consent source is required when contact authorization is recorded.'] };
    }
    if (data.optedOut && data.contactAuthorized) {
      return { errors: ['An opted-out citizen cannot be marked contact-authorized.'] };
    }
    return { data, errors: [] };
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : 'Invalid phone number.'] };
  }
}

export async function createCitizen(orgId: number, actorId: number, input: CitizenInput) {
  const result = parseCitizenInput(input);
  if (!result.data) return { errors: result.errors };
  const data = result.data;
  const now = new Date();
  const row = await Citizen.create({
    ...data,
    organizationId: orgId,
    contactAuthorized: data.contactAuthorized ?? false,
    consentRecordedAt: data.contactAuthorized ? now : null,
    optedOut: data.optedOut ?? false,
    optedOutAt: data.optedOut ? now : null,
    isActive: true,
    createdBy: actorId,
    updatedBy: actorId,
  });
  await writeAuditLog('citizen.created', actorId, { citizenId: row.id });
  return { citizen: row };
}

export async function updateCitizen(row: Citizen, actorId: number, input: CitizenInput) {
  const merged = {
    fullName: input.fullName !== undefined ? input.fullName : row.fullName,
    phone: input.phone !== undefined ? input.phone : row.phone,
    whatsappNumber: input.whatsappNumber !== undefined ? input.whatsappNumber : row.whatsappNumber,
    preferredLanguage: input.preferredLanguage ?? row.preferredLanguage,
    locality: input.locality !== undefined ? input.locality : row.locality,
    ward: input.ward !== undefined ? input.ward : row.ward,
    contactAuthorized: input.contactAuthorized ?? row.contactAuthorized,
    consentSource: input.consentSource !== undefined ? input.consentSource : row.consentSource,
    optedOut: input.optedOut ?? row.optedOut,
    notes: input.notes !== undefined ? input.notes : row.notes,
  };
  const result = parseCitizenInput(merged);
  if (!result.data) return { errors: result.errors };
  const data = result.data;
  if (data.contactAuthorized && !data.consentSource) {
    return { errors: ['A consent source is required when contact authorization is recorded.'] };
  }
  const previousAuthorized = row.contactAuthorized;
  const previousOptedOut = row.optedOut;
  Object.assign(row, data, {
    updatedBy: actorId,
    consentRecordedAt: data.contactAuthorized
      ? previousAuthorized && row.consentRecordedAt
        ? row.consentRecordedAt
        : new Date()
      : null,
    optedOutAt: data.optedOut
      ? previousOptedOut && row.optedOutAt
        ? row.optedOutAt
        : new Date()
      : null,
  });
  await row.save();
  await writeAuditLog('citizen.updated', actorId, { citizenId: row.id });
  if (previousAuthorized !== row.contactAuthorized || previousOptedOut !== row.optedOut) {
    await writeAuditLog('citizen.contact_preference_changed', actorId, {
      citizenId: row.id,
      contactAuthorized: row.contactAuthorized,
      optedOut: row.optedOut,
    });
  }
  return { citizen: row };
}

export async function deactivateCitizen(row: Citizen, actorId: number): Promise<void> {
  row.isActive = false;
  row.deactivatedAt = new Date();
  row.updatedBy = actorId;
  await row.save();
  await writeAuditLog('citizen.deactivated', actorId, { citizenId: row.id });
}

function cellToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const cell = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof cell.text === 'string') return cell.text.trim();
    if (typeof cell.result === 'string' || typeof cell.result === 'number')
      return String(cell.result).trim();
    if (cell.richText)
      return cell.richText
        .map(({ text }) => text ?? '')
        .join('')
        .trim();
  }
  return String(value).trim();
}

async function readSpreadsheet(
  file: Express.Multer.File,
): Promise<{ headers: string[]; rows: string[][] }> {
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (extension === 'csv') {
    if (file.buffer.includes(0))
      throw new CitizenImportError('CSV file contains invalid binary data.');
    let records: string[][];
    try {
      records = parse(file.buffer, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        max_record_size: 100_000,
        to_line: 5002,
      }) as string[][];
    } catch {
      throw new CitizenImportError(
        'CSV formatting could not be read. Check that rows use valid CSV quoting.',
      );
    }
    if (!records.length) throw new CitizenImportError('The CSV file is empty.');
    return { headers: records[0].map(cellToText), rows: records.slice(1) };
  }
  if (extension === 'xlsx') {
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b)
      throw new CitizenImportError('The XLSX file signature is invalid.');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as never);
    } catch {
      throw new CitizenImportError('The XLSX workbook could not be read.');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new CitizenImportError('The workbook does not contain a worksheet.');
    if (sheet.rowCount > 5002 || sheet.columnCount > 50)
      throw new CitizenImportError(
        'Import files may contain at most 5,000 data rows and 50 columns.',
      );
    const records: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        values[column - 1] = cellToText(cell.value);
      });
      records.push(values);
    });
    if (!records.length) throw new CitizenImportError('The worksheet is empty.');
    return { headers: records[0], rows: records.slice(1) };
  }
  throw new CitizenImportError('Upload a .csv or .xlsx file.');
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectMapping(headers: string[]): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: ImportMapping = {};
  for (const field of importableFields) {
    const found = normalized.findIndex((header) =>
      aliases[field].some((alias) => normalizeHeader(alias) === header),
    );
    if (found >= 0) mapping[field] = headers[found];
  }
  return mapping;
}

function readBoolean(value: string, field: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['yes', 'true', '1', 'y', 'authorized', 'opted out'].includes(normalized)) return true;
  if (['no', 'false', '0', 'n', 'not authorized', 'not opted out'].includes(normalized))
    return false;
  throw new Error(`${field} must be yes/no or true/false.`);
}

function readLanguage(value: string): 'as' | 'hi' | 'en' {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ['as', 'assamese'].includes(normalized)) return 'as';
  if (['hi', 'hindi'].includes(normalized)) return 'hi';
  if (['en', 'english'].includes(normalized)) return 'en';
  throw new Error('Language must be Assamese/as, Hindi/hi, or English/en.');
}

function mappedRow(row: string[], headers: string[], mapping: ImportMapping): CitizenInput {
  const value = (field: ImportField) => {
    const header = mapping[field];
    const index = header ? headers.indexOf(header) : -1;
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };
  return {
    fullName: value('fullName') || null,
    phone: value('phone') || null,
    whatsappNumber: value('whatsappNumber') || null,
    preferredLanguage: readLanguage(value('preferredLanguage')),
    locality: value('locality') || null,
    ward: value('ward') || null,
    contactAuthorized: readBoolean(value('contactAuthorized'), 'Contact authorization'),
    consentSource: value('consentSource') || null,
    optedOut: readBoolean(value('optedOut'), 'Opt-out status'),
    notes: value('notes') || null,
  };
}

function normalizeMapping(headers: string[], requested?: ImportMapping): ImportMapping {
  const suggestion = detectMapping(headers);
  const mapping: ImportMapping = { ...suggestion, ...(requested ?? {}) };
  for (const [field, header] of Object.entries(mapping)) {
    if (!importableFields.includes(field as ImportField))
      delete (mapping as Record<string, string>)[field];
    else if (header && !headers.includes(header)) delete mapping[field as ImportField];
  }
  return mapping;
}

export async function reviewCitizenImport(
  file: Express.Multer.File,
  orgId: number,
  requestedMapping?: ImportMapping,
): Promise<CitizenImportReview> {
  if (file.size > 5 * 1024 * 1024)
    throw new CitizenImportError('Import file must be 5 MB or smaller.');
  const { headers, rows } = await readSpreadsheet(file);
  if (headers.length > 50 || rows.length > 5000)
    throw new CitizenImportError(
      'Import files may contain at most 5,000 data rows and 50 columns.',
    );
  const mapping = normalizeMapping(headers, requestedMapping);
  const normalizedRows = rows
    .map((row, index) => {
      const rowNumber = index + 2;
      try {
        const raw = mappedRow(row, headers, mapping);
        const parsed = parseCitizenInput(raw);
        return { rowNumber, input: parsed.data, errors: parsed.errors };
      } catch (error) {
        return {
          rowNumber,
          input: undefined,
          errors: [error instanceof Error ? error.message : 'Invalid row.'],
        };
      }
    })
    .filter(({ input, errors }) => input || errors.length > 0);
  const phones = [
    ...new Set(normalizedRows.flatMap(({ input }) => (input?.phone ? [input.phone] : []))),
  ];
  const existing = phones.length
    ? await Citizen.findAll({
        where: { organizationId: orgId, phone: { [Op.in]: phones } },
        attributes: ['phone'],
      })
    : [];
  const seen = new Set(
    existing.map(({ phone }) => phone).filter((phone): phone is string => Boolean(phone)),
  );
  const results: ImportRowResult[] = normalizedRows.map(({ rowNumber, input, errors }) => {
    if (errors.length || !input) return { rowNumber, status: 'invalid', errors };
    if (input.phone && seen.has(input.phone))
      return {
        rowNumber,
        status: 'duplicate',
        errors: ['Phone number already exists in this organization or this file.'],
        citizen: input,
      };
    if (input.phone) seen.add(input.phone);
    return { rowNumber, status: 'ready', errors: [], citizen: input };
  });
  return {
    headers,
    suggestedMapping: detectMapping(headers),
    mapping,
    summary: {
      total: results.length,
      ready: results.filter(({ status }) => status === 'ready').length,
      duplicates: results.filter(({ status }) => status === 'duplicate').length,
      invalid: results.filter(({ status }) => status === 'invalid').length,
    },
    rows: results.slice(0, 50),
    privateRows: results
      .filter(({ status }) => status === 'ready')
      .map(({ rowNumber, status, citizen }) => ({
        rowNumber,
        status,
        citizen: citizen as Record<string, unknown>,
      })),
  };
}

export async function importCitizens(
  file: Express.Multer.File,
  orgId: number,
  actorId: number,
  mapping?: ImportMapping,
) {
  const review = await reviewCitizenImport(file, orgId, mapping);
  const now = new Date();
  const records = review.privateRows.map(({ citizen }) => {
    const input = citizen as CitizenInput;
    return {
      ...input,
      organizationId: orgId,
      contactAuthorized: input.contactAuthorized ?? false,
      consentRecordedAt: input.contactAuthorized ? now : null,
      optedOut: input.optedOut ?? false,
      optedOutAt: input.optedOut ? now : null,
      isActive: true,
      createdBy: actorId,
      updatedBy: actorId,
    };
  });
  await sequelize.transaction(async (transaction) => {
    if (records.length) await Citizen.bulkCreate(records, { transaction, validate: true });
  });
  const imported = records.length;
  await writeAuditLog('citizens.imported', actorId, {
    imported,
    duplicates: review.summary.duplicates,
    invalid: review.summary.invalid,
  });
  return {
    imported,
    duplicates: review.summary.duplicates,
    invalid: review.summary.invalid,
    total: review.summary.total,
    rows: review.rows,
  };
}
