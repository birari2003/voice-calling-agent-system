import type { NextFunction, Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { csvCell } from '../utils/csv.js';
import { Citizen } from '../models/index.js';
import { writeAuditLog } from '../services/auditService.js';
import {
  CitizenImportError,
  createCitizen,
  deactivateCitizen,
  importCitizens,
  reviewCitizenImport,
  updateCitizen,
  type CitizenInput,
  type ImportMapping,
} from '../services/citizenService.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  ward: z.string().trim().max(40).optional(),
  language: z.enum(['as', 'hi', 'en']).optional(),
  status: z.enum(['active', 'inactive', 'opted_out', 'authorized']).optional(),
  sortBy: z.enum(['fullName', 'phone', 'ward', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

function organizationId(request: Request): number {
  return request.authUser!.organizationId;
}

function actorId(request: Request): number {
  return request.authUser!.id;
}

export async function listCitizens(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const parsed = listQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid list filters.' } });
    return;
  }
  try {
    const { page, limit, search, ward, language, status, sortBy, sortOrder } = parsed.data;
    const where: Record<string | symbol, unknown> = { organizationId: organizationId(request) };
    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;
    else if (status === 'opted_out') where.optedOut = true;
    else if (status === 'authorized') where.contactAuthorized = true;
    if (ward) where.ward = ward;
    if (language) where.preferredLanguage = language;
    if (search) {
      where[Op.or] = ['fullName', 'phone', 'whatsappNumber', 'locality', 'ward'].map((field) => ({
        [field]: { [Op.like]: `%${search}%` },
      }));
    }
    const result = await Citizen.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [[sortBy, sortOrder.toUpperCase()]],
    });
    response.json({
      data: result.rows,
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCitizen(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const citizen = await Citizen.findOne({
      where: { id: request.params.id, organizationId: organizationId(request) },
    });
    if (!citizen) {
      response
        .status(404)
        .json({ error: { code: 'CITIZEN_NOT_FOUND', message: 'Citizen record was not found.' } });
      return;
    }
    response.json({ data: citizen });
  } catch (error) {
    next(error);
  }
}

export async function createCitizenHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await createCitizen(
      organizationId(request),
      actorId(request),
      request.body as CitizenInput,
    );
    if (result.errors) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: result.errors[0], details: result.errors },
      });
      return;
    }
    response.status(201).json({ data: result.citizen });
  } catch (error) {
    next(error);
  }
}

export async function updateCitizenHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const citizen = await Citizen.findOne({
      where: { id: request.params.id, organizationId: organizationId(request) },
    });
    if (!citizen) {
      response
        .status(404)
        .json({ error: { code: 'CITIZEN_NOT_FOUND', message: 'Citizen record was not found.' } });
      return;
    }
    const result = await updateCitizen(citizen, actorId(request), request.body as CitizenInput);
    if (result.errors) {
      response.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: result.errors[0], details: result.errors },
      });
      return;
    }
    response.json({ data: result.citizen });
  } catch (error) {
    next(error);
  }
}

export async function deactivateCitizenHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const citizen = await Citizen.findOne({
      where: { id: request.params.id, organizationId: organizationId(request) },
    });
    if (!citizen) {
      response
        .status(404)
        .json({ error: { code: 'CITIZEN_NOT_FOUND', message: 'Citizen record was not found.' } });
      return;
    }
    if (!citizen.isActive) {
      response.status(409).json({
        error: { code: 'ALREADY_INACTIVE', message: 'Citizen record is already inactive.' },
      });
      return;
    }
    await deactivateCitizen(citizen, actorId(request));
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

function readImportMapping(value: unknown): ImportMapping | undefined {
  if (value === undefined || value === '') return undefined;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new CitizenImportError('Column mapping is invalid JSON.');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CitizenImportError('Column mapping must be an object.');
  return value as ImportMapping;
}

function requireImportFile(request: Request): Express.Multer.File {
  if (!request.file) throw new CitizenImportError('Choose a CSV or XLSX file to continue.');
  return request.file;
}

export async function previewCitizenImport(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mapping = readImportMapping(request.body.mapping);
    const review = await reviewCitizenImport(
      requireImportFile(request),
      organizationId(request),
      mapping,
    );
    response.json({ data: review });
  } catch (error) {
    if (error instanceof CitizenImportError) {
      response.status(400).json({ error: { code: 'IMPORT_INVALID', message: error.message } });
      return;
    }
    next(error);
  }
}

export async function importCitizenFile(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const mapping = readImportMapping(request.body.mapping);
    const result = await importCitizens(
      requireImportFile(request),
      organizationId(request),
      actorId(request),
      mapping,
    );
    response.status(201).json({ data: result });
  } catch (error) {
    if (error instanceof CitizenImportError) {
      response.status(400).json({ error: { code: 'IMPORT_INVALID', message: error.message } });
      return;
    }
    next(error);
  }
}

export async function exportCitizens(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rows = await Citizen.findAll({
      where: { organizationId: organizationId(request) },
      order: [['createdAt', 'DESC']],
    });
    const fields = [
      ['fullName', 'full_name'],
      ['phone', 'phone'],
      ['whatsappNumber', 'whatsapp_number'],
      ['preferredLanguage', 'preferred_language'],
      ['locality', 'locality'],
      ['ward', 'ward'],
      ['contactAuthorized', 'contact_authorized'],
      ['consentSource', 'consent_source'],
      ['optedOut', 'opted_out'],
      ['isActive', 'is_active'],
      ['notes', 'notes'],
    ] as const;
    const lines = [fields.map(([, header]) => header).join(',')];
    for (const row of rows) lines.push(fields.map(([field]) => csvCell(row.get(field))).join(','));
    await writeAuditLog('citizens.exported', actorId(request), { count: rows.length });
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="citizens.csv"');
    response.send(`\uFEFF${lines.join('\r\n')}`);
  } catch (error) {
    next(error);
  }
}
