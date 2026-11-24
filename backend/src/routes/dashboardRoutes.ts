import { Router } from 'express';
import { getOverview } from '../controllers/dashboardController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';

export const dashboardRoutes = Router();
dashboardRoutes.get(
  '/overview',
  requireAuthentication,
  requirePermission('dashboard:read'),
  getOverview,
);
