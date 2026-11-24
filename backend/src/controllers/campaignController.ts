import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { LANGUAGES } from '../ai/types.js';
import { SessionError } from '../services/sessionService.js';
import {
  CampaignError,
  cancelCampaign,
  createCampaign,
  getCampaign,
  listCampaigns,
  listRecipients,
  pauseCampaign,
  previewEligibility,
  resumeCampaign,
  startCampaign,
  startNextSession,
  updateCampaign,
} from '../services/campaignService.js';

const idSchema = z.coerce.number().int().positive();
const targetFilterSchema = z
  .object({
    wards: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    locality: z.string().trim().min(1).max(160).optional(),
    language: z.enum(LANGUAGES).optional(),
  })
  .strict();
const campaignFields = {
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).nullable(),
  defaultLanguage: z.enum(LANGUAGES).nullable(),
  channel: z.enum(['text', 'voice']),
  targetFilter: targetFilterSchema,
  maxAttempts: z.coerce.number().int().min(1).max(3),
  scheduledAt: z.coerce.date().nullable(),
};
const createSchema = z
  .object({
    ...campaignFields,
    description: campaignFields.description.default(null),
    defaultLanguage: campaignFields.defaultLanguage.default(null),
    channel: campaignFields.channel.default('text'),
    targetFilter: targetFilterSchema.default({}),
    maxAttempts: campaignFields.maxAttempts.default(1),
    scheduledAt: campaignFields.scheduledAt.default(null),
  })
  .strict();
const patchSchema = z
  .object(campaignFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field.');
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'failed', 'skipped', 'opted_out'])
    .optional(),
});

const org = (request: Request) => request.authUser!.organizationId;
const actor = (request: Request) => request.authUser!.id;

function sendError(error: unknown, response: Response, next: NextFunction): void {
  if (error instanceof CampaignError || error instanceof SessionError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  next(error);
}

function invalid(response: Response, message: string): void {
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function withId(handler: (request: Request, response: Response, id: number) => Promise<void>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const id = idSchema.safeParse(request.params.id);
    if (!id.success) return invalid(response, 'Campaign ID is invalid.');
    try {
      await handler(request, response, id.data);
    } catch (error) {
      sendError(error, response, next);
    }
  };
}

export async function listHandler(request: Request, response: Response, next: NextFunction) {
  const parsed = pageSchema.safeParse(request.query);
  if (!parsed.success) return invalid(response, 'Invalid pagination.');
  try {
    const { page, limit } = parsed.data;
    const result = await listCampaigns(org(request), page, limit);
    response.json({
      data: result.rows,
      pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function createHandler(request: Request, response: Response, next: NextFunction) {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success)
    return invalid(response, 'Enter a campaign name (3–160 characters) and valid settings.');
  try {
    const campaign = await createCampaign(org(request), actor(request), parsed.data);
    response.status(201).json({ data: await getCampaign(org(request), campaign.id) });
  } catch (error) {
    sendError(error, response, next);
  }
}

export const getHandler = withId(async (request, response, id) => {
  response.json({ data: await getCampaign(org(request), id) });
});

export const patchHandler = withId(async (request, response, id) => {
  const parsed = patchSchema.safeParse(request.body);
  if (!parsed.success) return invalid(response, 'Provide valid campaign settings to update.');
  await updateCampaign(org(request), actor(request), id, parsed.data);
  response.json({ data: await getCampaign(org(request), id) });
});

export const previewHandler = withId(async (request, response, id) => {
  const preview = await previewEligibility(org(request), actor(request), id);
  response.json({ data: { preview, campaign: await getCampaign(org(request), id) } });
});

function transition(
  action: (organizationId: number, actorId: number, campaignId: number) => Promise<unknown>,
) {
  return withId(async (request, response, id) => {
    await action(org(request), actor(request), id);
    response.json({ data: await getCampaign(org(request), id) });
  });
}

export const startHandler = transition(startCampaign);
export const pauseHandler = transition(pauseCampaign);
export const resumeHandler = transition(resumeCampaign);
export const cancelHandler = transition(cancelCampaign);

export const nextSessionHandler = withId(async (request, response, id) => {
  const channel = z.enum(['text', 'voice']).optional().safeParse(request.body?.channel);
  if (!channel.success) return invalid(response, 'Channel must be text or voice.');
  const result = await startNextSession(org(request), actor(request), id, channel.data);
  if (!result) {
    response.status(409).json({
      error: {
        code: 'NO_PENDING_RECIPIENTS',
        message: 'No recipients are waiting in this campaign.',
      },
      data: await getCampaign(org(request), id),
    });
    return;
  }
  response.status(201).json({ data: result });
});

export const recipientsHandler = withId(async (request, response, id) => {
  const parsed = pageSchema.safeParse(request.query);
  if (!parsed.success) return invalid(response, 'Invalid recipient filters.');
  const { page, limit, status } = parsed.data;
  const result = await listRecipients(org(request), id, status, page, limit);
  response.json({
    data: result.rows,
    pagination: { page, limit, total: result.count, pages: Math.ceil(result.count / limit) },
  });
});
