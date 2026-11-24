import { Router } from 'express';
import {
  cancelHandler,
  completeHandler,
  confirmHandler,
  createSessionHandler,
  getSessionHandler,
  listSessionsHandler,
  transcriptHandler,
  turnHandler,
} from '../controllers/sessionController.js';
import {
  audioTurnHandler,
  audioUpload,
  messageSpeechHandler,
} from '../controllers/voiceController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { requireCsrf } from '../middleware/csrfMiddleware.js';
import { perUserLimit } from '../middleware/rateLimits.js';

export const sessionRoutes = Router();
sessionRoutes.use(requireAuthentication);
sessionRoutes.get('/', requirePermission('sessions:read'), listSessionsHandler);
sessionRoutes.post('/', requireCsrf, requirePermission('sessions:run'), createSessionHandler);
sessionRoutes.get('/:id', requirePermission('sessions:read'), getSessionHandler);
sessionRoutes.get('/:id/transcript', requirePermission('sessions:read'), transcriptHandler);
sessionRoutes.post('/:id/turn', requireCsrf, requirePermission('sessions:run'), turnHandler);
sessionRoutes.post('/:id/confirm', requireCsrf, requirePermission('sessions:run'), confirmHandler);
sessionRoutes.post('/:id/cancel', requireCsrf, requirePermission('sessions:run'), cancelHandler);
sessionRoutes.post(
  '/:id/complete',
  requireCsrf,
  requirePermission('sessions:run'),
  completeHandler,
);
sessionRoutes.post(
  '/:id/audio-turn',
  requireCsrf,
  requirePermission('sessions:run'),
  perUserLimit(60, 5, 'speech'),
  audioUpload,
  audioTurnHandler,
);
sessionRoutes.get(
  '/:id/messages/:messageId/speech',
  requirePermission('sessions:run'),
  perUserLimit(150, 5, 'speech'),
  messageSpeechHandler,
);
