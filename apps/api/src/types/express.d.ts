import type { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: JwtPayload & { userId: number };
      subject?: JwtPayload & {
        userId: string;
        email: string;
        roles: string[];
        permissions: string[];
      };
    }
  }
}

export {};
