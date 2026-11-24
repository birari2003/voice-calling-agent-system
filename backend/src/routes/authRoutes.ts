import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { changePassword, currentUser, login, logout } from '../controllers/authController.js';
import { requireAuthentication } from '../middleware/authMiddleware.js';
import { issueCsrfToken, requireCsrf } from '../middleware/csrfMiddleware.js';

export const authRoutes = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  // Only failed sign-ins count, so colleagues behind one office IP are not locked out.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' },
  },
});

authRoutes.get('/csrf', issueCsrfToken);
authRoutes.post('/login', loginLimiter, requireCsrf, login);
authRoutes.get('/me', requireAuthentication, currentUser);
authRoutes.post('/logout', requireCsrf, logout);
authRoutes.post('/password', requireCsrf, requireAuthentication, changePassword);
