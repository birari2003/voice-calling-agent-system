import { Router } from 'express';
import {
  cancelHandler,
  createHandler,
  getHandler,
  listHandler,
  nextSessionHandler,
  patchHandler,
  pauseHandler,
  previewHandler,
  recipientsHandler,
  resumeHandler,
  startHandler,
} from '../controllers/campaignController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { requireCsrf } from '../middleware/csrfMiddleware.js';

export const campaignRoutes = Router();
campaignRoutes.use(requireAuthentication, requirePermission('campaigns:manage'));
campaignRoutes.get('/', listHandler);
campaignRoutes.post('/', requireCsrf, createHandler);
campaignRoutes.get('/:id', getHandler);
campaignRoutes.patch('/:id', requireCsrf, patchHandler);
campaignRoutes.get('/:id/recipients', recipientsHandler);
campaignRoutes.post('/:id/eligibility-preview', requireCsrf, previewHandler);
campaignRoutes.post('/:id/start-simulation', requireCsrf, startHandler);
campaignRoutes.post('/:id/pause', requireCsrf, pauseHandler);
campaignRoutes.post('/:id/resume', requireCsrf, resumeHandler);
campaignRoutes.post('/:id/cancel', requireCsrf, cancelHandler);
// Running a recipient's conversation also needs permission to run simulated sessions.
campaignRoutes.post(
  '/:id/next-session',
  requireCsrf,
  requirePermission('sessions:run'),
  nextSessionHandler,
);
