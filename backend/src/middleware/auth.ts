import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export interface AuthedRequest extends Request {
  userId?: string;
  tenantId?: string;
  role?: string;
}

/**
 * Resolves the caller's tenant and user from either:
 *   - Authorization: Bearer <JWT>   (human users)
 *   - X-API-Key: <tenant api key>   (local-install sync worker, server-to-server)
 */
export async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');
  const authHeader = req.header('Authorization');

  if (apiKey) {
    const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
    if (!tenant) return res.status(401).json({ error: 'Invalid API key' });
    req.tenantId = tenant.id;
    req.role = 'service';
    return next();
  }

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice('Bearer '.length);
      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; tid: string; role: string };
      req.userId = payload.sub;
      req.tenantId = payload.tid;
      req.role = payload.role;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  return res.status(401).json({ error: 'Authentication required' });
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
