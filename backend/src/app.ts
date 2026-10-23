import express from 'express';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { householdRouter } from './routes/household';
import { tasksRouter } from './routes/tasks';
import { rewardsRouter } from './routes/rewards';

export function createApp() {
  const app = express();
  app.use(express.json());

  // CORS simples: permite o app web/PWA e testes no navegador.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/household', requireAuth, householdRouter);
  app.use('/tasks', requireAuth, tasksRouter);
  app.use('/rewards', requireAuth, rewardsRouter);

  return app;
}
