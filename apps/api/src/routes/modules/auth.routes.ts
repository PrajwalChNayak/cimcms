import AuthController from '@/controllers/auth.controller';
import authenticateToken from '@/middleware/auth.middleware';
import { loginIpLimiter, loginLimiter } from '@/security/limiter.security';
import { Router } from 'express';

/** Consumer (public) identity. CIMCMS staff use /user/* instead. */
export default (router: Router): void => {
  router.post('/auth/register', loginIpLimiter, AuthController.register);
  router.post('/auth/login', loginIpLimiter, loginLimiter, AuthController.login);
  router.get('/auth/token/refresh', authenticateToken, AuthController.refreshToken);
  router.get('/auth/me', authenticateToken, AuthController.me);
};
