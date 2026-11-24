import { Router } from 'express';
import multer from 'multer';
import {
  createCitizenHandler,
  deactivateCitizenHandler,
  exportCitizens,
  getCitizen,
  importCitizenFile,
  listCitizens,
  previewCitizenImport,
  updateCitizenHandler,
} from '../controllers/citizenController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { requireCsrf } from '../middleware/csrfMiddleware.js';
import { perUserLimit } from '../middleware/rateLimits.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, parts: 22 },
  fileFilter(_request, file, callback) {
    const extension = file.originalname.toLowerCase().split('.').pop();
    if (extension !== 'csv' && extension !== 'xlsx') {
      callback(null, false);
      return;
    }
    callback(null, true);
  },
});

export const citizenRoutes = Router();
citizenRoutes.use(requireAuthentication);
citizenRoutes.get('/', requirePermission('citizens:read'), listCitizens);
citizenRoutes.get(
  '/export',
  requirePermission('citizens:export'),
  perUserLimit(20, 15, 'export'),
  exportCitizens,
);
citizenRoutes.post(
  '/import/preview',
  requireCsrf,
  requirePermission('citizens:import'),
  perUserLimit(30, 15, 'import'),
  upload.single('file'),
  previewCitizenImport,
);
citizenRoutes.post(
  '/import',
  requireCsrf,
  requirePermission('citizens:import'),
  perUserLimit(30, 15, 'import'),
  upload.single('file'),
  importCitizenFile,
);
citizenRoutes.post('/', requireCsrf, requirePermission('citizens:manage'), createCitizenHandler);
citizenRoutes.get('/:id', requirePermission('citizens:read'), getCitizen);
citizenRoutes.patch(
  '/:id',
  requireCsrf,
  requirePermission('citizens:manage'),
  updateCitizenHandler,
);
citizenRoutes.delete(
  '/:id',
  requireCsrf,
  requirePermission('citizens:manage'),
  deactivateCitizenHandler,
);
