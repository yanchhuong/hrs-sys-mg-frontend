import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import type { AuthedRequest } from '../middleware/auth.js';

export const employeesRouter = Router();

employeesRouter.get('/', async (req: AuthedRequest, res) => {
  const rows = await prisma.employee.findMany({
    where: { tenantId: req.tenantId! },
    include: { department: { select: { id: true, name: true } } },
    orderBy: { empNo: 'asc' },
    take: 500,
  });
  res.json({ employees: rows });
});

employeesRouter.get('/:id', async (req: AuthedRequest, res) => {
  const row = await prisma.employee.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: { department: true, contracts: true },
  });
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
