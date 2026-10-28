import { Router } from 'express';
import { administradoresDaCasa, registrarAtividade } from '../activities';
import { all, atomic, get, run } from '../db';
import { ah } from '../http';
import { canManage, canRedeem, validateCost } from '../rules';

export const rewardsRouter = Router();

rewardsRouter.get('/', ah(async (req, res) => {
  const rows = await all(
    'SELECT id, title, cost FROM rewards WHERE household_id = ? ORDER BY cost',
    [req.user!.householdId],
  );
  res.json({ rewards: rows });
}));

/** Só o administrador cria recompensas. */
rewardsRouter.post('/', ah(async (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o administrador cria recompensas' });

  const { title, cost } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 2) {
    return res.status(400).json({ error: 'Informe o nome da recompensa' });
  }
  const costErr = validateCost(cost);
  if (costErr) return res.status(400).json({ error: costErr });

  const info = await run(
    'INSERT INTO rewards (household_id, title, cost) VALUES (?, ?, ?)',
    [user.householdId, title.trim(), cost],
  );
  res.status(201).json({ id: info.lastInsertRowid });
}));

/** O usuário resgata: debita o XP e registra o resgate, na mesma operação. */
rewardsRouter.post('/:id/redeem', ah(async (req, res) => {
  const user = req.user!;
  const reward = await get<{ id: number; title: string; cost: number }>(
    'SELECT id, title, cost FROM rewards WHERE id = ? AND household_id = ?',
    [Number(req.params.id), user.householdId],
  );
  if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });

  // Lê o saldo do banco (não do token), para não usar saldo desatualizado.
  const current = await get<{ xp: number }>('SELECT xp FROM users WHERE id = ?', [user.id]);
  if (!canRedeem(user.role, Number(current!.xp), Number(reward.cost))) {
    return res.status(400).json({ error: 'XP insuficiente para este resgate' });
  }

  await atomic([
    { sql: 'UPDATE users SET xp = xp - ? WHERE id = ?', args: [reward.cost, user.id] },
    { sql: 'INSERT INTO redemptions (reward_id, user_id) VALUES (?, ?)', args: [reward.id, user.id] },
  ]);

  // Avisa todos os administradores da casa.
  await registrarAtividade({
    householdId: user.householdId,
    recipientIds: await administradoresDaCasa(user.householdId),
    actorId: user.id,
    kind: 'RECOMPENSA_RESGATADA',
    title: reward.title,
    amount: Number(reward.cost),
  });
  res.json({ ok: true, xp: Number(current!.xp) - Number(reward.cost) });
}));

/**
 * Só o administrador exclui recompensas da própria casa.
 * Os resgates antigos dela também são removidos. O XP já gasto não é devolvido.
 */
rewardsRouter.delete('/:id', ah(async (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o administrador exclui recompensas' });

  const id = Number(req.params.id);
  const reward = await get('SELECT id FROM rewards WHERE id = ? AND household_id = ?', [id, user.householdId]);
  if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });

  await atomic([
    { sql: 'DELETE FROM redemptions WHERE reward_id = ?', args: [id] },
    { sql: 'DELETE FROM rewards WHERE id = ?', args: [id] },
  ]);
  res.json({ ok: true });
}));
