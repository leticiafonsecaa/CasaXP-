import { Router } from 'express';
import { createSession } from '../auth';
import { get } from '../db';
import { ah } from '../http';

// Acesso rápido de demonstração. Só funciona com DEMO_MODE=true no servidor.
export const demoRouter = Router();

const CONTAS = {
  admin: 'admin@demo.casaxp',
  usuario: 'usuario@demo.casaxp',
} as const;

demoRouter.post('/login', ah(async (req, res) => {
  if (process.env.DEMO_MODE !== 'true') return res.status(404).json({ error: 'Não encontrado' });

  const papel = req.body?.papel;
  if (papel !== 'admin' && papel !== 'usuario') {
    return res.status(400).json({ error: 'Escolha admin ou usuario' });
  }

  const email: string = papel === 'admin' ? CONTAS.admin : CONTAS.usuario;
  const user = await get<{ id: number; household_id: number; name: string; email: string; role: string; xp: number }>(
    'SELECT id, household_id, name, email, role, xp FROM users WHERE email = ?',
    [email],
  );
  if (!user) {
    return res.status(404).json({ error: 'Contas de demonstração não encontradas. Rode npm run seed.' });
  }

  const token = await createSession(Number(user.id));
  res.json({
    token,
    user: {
      id: Number(user.id),
      householdId: Number(user.household_id),
      name: user.name,
      email: user.email,
      role: user.role,
      xp: Number(user.xp),
    },
  });
}));
