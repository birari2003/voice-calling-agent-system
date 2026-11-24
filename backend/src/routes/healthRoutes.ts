import { Router } from 'express';
import { getHealth, getLiveness } from '../controllers/healthController.js';

export const healthRoutes = Router();
healthRoutes.get('/', getHealth);
healthRoutes.get('/live', getLiveness);
