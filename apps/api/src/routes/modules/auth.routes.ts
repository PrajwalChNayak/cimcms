import AuthController from '@/controllers/auth.controller';
import authenticateToken from '@/middleware/auth.middleware';
import { loginLimiter } from '@/security/limiter.security';
import { Router } from 'express';

export default (router: Router): void => {
  router.post('/auth/register', AuthController.register);
  router.post('/auth/login', loginLimiter, AuthController.login);

  // router.get('/auth/token/refresh', authenticateToken, AuthController.refreshToken);
  // router.get('/auth/me', authenticateToken, AuthController.me);

    router.get('/auth/token/refresh', AuthController.refreshToken);
  router.get('/auth/me', AuthController.me);
};
