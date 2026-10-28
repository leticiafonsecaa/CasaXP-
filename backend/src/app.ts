import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { requireAuth } from './auth';
import { activitiesRouter } from './routes/activities';
import { demoRouter } from './routes/demo';
import { authRouter } from './routes/auth';
import { householdRouter } from './routes/household';
import { rewardsRouter } from './routes/rewards';
import { tasksRouter } from './routes/tasks';

// Pasta com o app web já compilado (criada pelo comando "npm run build" dentro de web/).
const webDist = path.resolve(__dirname, '../../web/dist');

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Diz ao app se os botões de acesso rápido devem aparecer.
  app.get('/api/config', (_req, res) => res.json({ demo: process.env.DEMO_MODE === 'true' }));
  app.use('/api/demo', demoRouter);
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

  // Erros inesperados (por exemplo, falha de conexão com o banco) viram uma resposta de erro.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno. Tente de novo.' });
  });

  return app;
}
