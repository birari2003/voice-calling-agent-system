import { Router } from 'express';
import {
  addNote,
  archive,
  assign,
  assignees,
  changeStatus,
  complaintTranscript,
  createComplaintHandler,
  getComplaint,
  listComplaints,
  statusHistory,
  updateDetails,
} from '../controllers/complaintController.js';
import { requireAuthentication, requirePermission } from '../middleware/authMiddleware.js';
import { requireCsrf } from '../middleware/csrfMiddleware.js';

export const complaintRoutes = Router();
complaintRoutes.use(requireAuthentication);
complaintRoutes.get('/', requirePermission('complaints:read'), listComplaints);
complaintRoutes.post(
  '/',
  requireCsrf,
  requirePermission('complaints:create'),
  createComplaintHandler,
);
complaintRoutes.get('/assignees', requirePermission('complaints:assign'), assignees);
complaintRoutes.get('/:id/history', requirePermission('complaints:read'), statusHistory);
complaintRoutes.get('/:id/transcript', requirePermission('complaints:read'), complaintTranscript);
complaintRoutes.get('/:id', requirePermission('complaints:read'), getComplaint);
complaintRoutes.patch('/:id', requireCsrf, requirePermission('complaints:update'), updateDetails);
complaintRoutes.post(
  '/:id/status',
  requireCsrf,
  requirePermission('complaints:update'),
  changeStatus,
);
complaintRoutes.post('/:id/assign', requireCsrf, requirePermission('complaints:assign'), assign);
complaintRoutes.post('/:id/notes', requireCsrf, requirePermission('complaints:notes'), addNote);
complaintRoutes.post('/:id/archive', requireCsrf, requirePermission('complaints:archive'), archive);
