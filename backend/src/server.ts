import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { corsOrigins, env } from './lib/env.js';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { syncRouter } from './routes/sync.js';
import { authenticate } from './middleware/auth.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health — unauthenticated so load balancers / Docker healthchecks can hit it.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: env.DEPLOYMENT_MODE, ts: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);

// Everything below requires JWT or API key
app.use('/api', authenticate);
app.use('/api/employees', employeesRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(env.PORT, () => {
  console.log(`HRMS backend listening on :${env.PORT} [mode=${env.DEPLOYMENT_MODE}]`);
});
