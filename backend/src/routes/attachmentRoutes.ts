import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createLinkHandler,
  downloadHandler,
  listLinksHandler,
  listPhotosHandler,
  photoUpload,
  publicLinkInfoHandler,
  publicUploadHandler,
  revokeLinkHandler,
  uploadPhotoHandler,
} from '../controllers/attachmentController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { requireCsrf } from '../middleware/csrfMiddleware.js';
import { perUserLimit } from '../middleware/rateLimits.js';

/** Mounted under /complaints; authentication is per route so other complaint routes are unaffected. */
export const complaintAttachmentRoutes = Router();
complaintAttachmentRoutes.get(
  '/:id/attachments',
  requireAuthentication,
  requirePermission('attachments:read'),
  listPhotosHandler,
);
complaintAttachmentRoutes.post(
  '/:id/attachments',
  requireCsrf,
  requireAuthentication,
  requirePermission('attachments:upload'),
  perUserLimit(60, 15, 'photo upload'),
  photoUpload,
  uploadPhotoHandler,
);
complaintAttachmentRoutes.get(
  '/:id/upload-links',
  requireAuthentication,
  requirePermission('attachments:upload'),
  listLinksHandler,
);
complaintAttachmentRoutes.post(
  '/:id/upload-link',
  requireCsrf,
  requireAuthentication,
  requirePermission('attachments:upload'),
  createLinkHandler,
);

export const attachmentRoutes = Router();
attachmentRoutes.use(requireAuthentication);
attachmentRoutes.get('/:id/download', requirePermission('attachments:read'), downloadHandler);

export const uploadLinkRoutes = Router();
uploadLinkRoutes.use(requireAuthentication);
uploadLinkRoutes.post(
  '/:id/revoke',
  requireCsrf,
  requirePermission('attachments:upload'),
  revokeLinkHandler,
);

const limited = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' },
    },
  });

/**
 * Citizen-facing upload endpoints. No login or cookies: the unguessable link token is the only
 * credential, and it only allows adding a limited number of photos to one complaint.
 */
export const publicUploadRoutes = Router();
publicUploadRoutes.get('/:token', limited(60), publicLinkInfoHandler);
publicUploadRoutes.post('/:token', limited(20), photoUpload, publicUploadHandler);
