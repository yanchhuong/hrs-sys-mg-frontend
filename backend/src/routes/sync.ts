import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthedRequest } from '../middleware/auth.js';

/**
 * Sync endpoints consumed by the local-install sync worker.
 * Both sides identify themselves with X-API-Key.
 */
export const syncRouter = Router();
syncRouter.use(authenticate);

// Local pushes a batch of outbox entries up to the cloud.
const pushSchema = z.object({
  changes: z.array(z.object({
    id: z.string(),
    entity: z.string(),
    entityId: z.string(),
    operation: z.enum(['create', 'update', 'delete']),
    payload: z.any(),
    createdAt: z.string(),
  })),
});

syncRouter.post('/push', async (req: AuthedRequest, res) => {
  if (req.role !== 'service') return res.status(403).json({ error: 'service-only endpoint' });
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid batch' });

  // TODO: apply changes with last-write-wins per entity+id. For now, ack.
  res.json({ acked: parsed.data.changes.map((c) => c.id) });
});

// Local pulls changes since cursor.
syncRouter.get('/pull', async (req: AuthedRequest, res) => {
  if (req.role !== 'service') return res.status(403).json({ error: 'service-only endpoint' });
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);

  // TODO: stream recent updates from each scoped table filtered by updatedAt > since.
  // Minimal placeholder that reports an empty change set.
  res.json({ cursor: new Date().toISOString(), changes: [] });
});
