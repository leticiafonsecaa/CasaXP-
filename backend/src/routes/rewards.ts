import { Router } from 'express';
import { db, tx } from '../db';
import { canManage, canRedeem, validateCost } from '../rules';

export const rewardsRouter = Router();

rewardsRouter.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, cost FROM rewards WHERE household_id = ? ORDER BY cost')
    .all(req.user!.householdId);
  res.json({ rewards: rows });
});

/** Só o responsável cria recompensas. */
rewardsRouter.post('/', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o responsável cria recompensas' });

  const { title, cost } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 2) {
    return res.status(400).json({ error: 'Informe o nome da recompensa' });
  }
  const costErr = validateCost(cost);
  if (costErr) return res.status(400).json({ error: costErr });

  const info = db
    .prepare('INSERT INTO rewards (household_id, title, cost) VALUES (?, ?, ?)')
    .run(user.householdId, title.trim(), cost);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

/** Adolescente resgata: debita o XP e registra o resgate, numa transação. */
rewardsRouter.post('/:id/redeem', (req, res) => {
  const user = req.user!;
  const reward = db
    .prepare('SELECT id, cost FROM rewards WHERE id = ? AND household_id = ?')
    .get(Number(req.params.id), user.householdId) as { id: number; cost: number } | undefined;
  if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });

  // Lê o saldo atual do banco, não do token, para evitar saldo desatualizado.
  const current = db.prepare('SELECT xp FROM users WHERE id = ?').get(user.id) as { xp: number };
  if (!canRedeem(user.role, current.xp, reward.cost)) {
    return res.status(400).json({ error: 'XP insuficiente para este resgate' });
  }

  const newBalance = tx(() => {
    db.prepare('UPDATE users SET xp = xp - ? WHERE id = ?').run(reward.cost, user.id);
    db.prepare('INSERT INTO redemptions (reward_id, user_id) VALUES (?, ?)').run(reward.id, user.id);
    return current.xp - reward.cost;
  });
  res.json({ ok: true, xp: newBalance });
});
