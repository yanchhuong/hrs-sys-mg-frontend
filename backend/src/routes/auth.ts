import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { env } from '../lib/env.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().optional(),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });

  const { email, password, tenantSlug } = parsed.data;

  // Local mode: tenant is pinned by env; slug from body is ignored.
  // Cloud mode: tenant must be identified either by slug or by host header mapping.
  const tenant = env.DEPLOYMENT_MODE === 'local'
    ? await prisma.tenant.findUnique({ where: { slug: env.LOCAL_TENANT_SLUG! } })
    : tenantSlug
      ? await prisma.tenant.findUnique({ where: { slug: tenantSlug } })
      : null;

  if (!tenant) return res.status(401).json({ error: 'Unknown tenant' });

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  const token = jwt.sign(
    { sub: user.id, tid: tenant.id, role: user.role },
    env.JWT_SECRET,
    { expiresIn: '8h' },
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      tenantSlug: tenant.slug,
    },
  });
});
