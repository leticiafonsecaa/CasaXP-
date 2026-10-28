import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { householdRouter } from './routes/household';
import { tasksRouter } from './routes/tasks';
import { rewardsRouter } from './routes/rewards';
import { activitiesRouter } from './routes/activities';

// Pasta com o app web já compilado (criada pelo comando "npm run build" dentro de web/).
const webDist = path.resolve(__dirname, '../../web/dist');

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/household', requireAuth, householdRouter);
  app.use('/api/tasks', requireAuth, tasksRouter);
  app.use('/api/rewards', requireAuth, rewardsRouter);
  app.use('/api/activities', requireAuth, activitiesRouter);

  // Serve o app web (PWA) na mesma porta e no mesmo endereço HTTPS da API.
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  }

  return app;
}
