import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { authRoutes } from './routes/authRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { citizenRoutes } from './routes/citizenRoutes.js';
import { complaintRoutes } from './routes/complaintRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { sessionRoutes } from './routes/sessionRoutes.js';
import { aiRoutes } from './routes/aiRoutes.js';
import { campaignRoutes } from './routes/campaignRoutes.js';
import { reportRoutes } from './routes/reportRoutes.js';
import {
  attachmentRoutes,
  complaintAttachmentRoutes,
  publicUploadRoutes,
  uploadLinkRoutes,
} from './routes/attachmentRoutes.js';

export const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy, use the client address it reports (for rate limits and logs).
app.set('trust proxy', env.TRUST_PROXY);
app.use(requestContext);
app.use(helmet());
const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    // Lets the dashboard read the server-chosen file name of CSV exports.
    exposedHeaders: ['Content-Disposition'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/citizens', citizenRoutes);
app.use('/api/v1/complaints', complaintAttachmentRoutes);
app.use('/api/v1/complaints', complaintRoutes);
app.use('/api/v1/attachments', attachmentRoutes);
app.use('/api/v1/upload-links', uploadLinkRoutes);
app.use('/api/v1/public/uploads', publicUploadRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use((_request, response) =>
  response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }),
);
app.use(errorHandler);
