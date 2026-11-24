import { Router } from 'express';
import {
  byCategoryHandler,
  byStatusHandler,
  byWardHandler,
  campaignsHandler,
  exportComplaintsHandler,
  overTimeHandler,
  overviewHandler,
  sessionsHandler,
} from '../controllers/reportController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { perUserLimit } from '../middleware/rateLimits.js';

export const reportRoutes = Router();
reportRoutes.use(requireAuthentication, requirePermission('reports:read'));
reportRoutes.get('/overview', overviewHandler);
reportRoutes.get('/complaints-by-status', byStatusHandler);
reportRoutes.get('/complaints-by-category', byCategoryHandler);
reportRoutes.get('/complaints-by-ward', byWardHandler);
reportRoutes.get('/complaints-over-time', overTimeHandler);
reportRoutes.get('/sessions', sessionsHandler);
reportRoutes.get('/campaigns', campaignsHandler);
reportRoutes.get('/export/complaints.csv', perUserLimit(20, 15, 'export'), exportComplaintsHandler);
