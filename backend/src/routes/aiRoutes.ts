import { Router } from 'express';
import { aiConfig, aiHealth } from '../controllers/aiController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';

export const aiRoutes = Router();
aiRoutes.use(requireAuthentication);
aiRoutes.get('/health', requirePermission('sessions:run'), aiHealth);
aiRoutes.get('/config', requirePermission('settings:manage'), aiConfig);
