import { Router } from 'express';
import { all, atomic, get } from '../db';
import { ah } from '../http';

export const householdRouter = Router();

/** Mostra o nome da casa, os membros e, só para o administrador, o código de convite. */
householdRouter.get('/', ah(async (req, res) => {
  const user = req.user!;
  const casa = await get<{ name: string; inviteCode: string }>(
    'SELECT name, invite_code AS inviteCode FROM households WHERE id = ?',
    [user.householdId],
  );
  const members = await all(
    'SELECT id, name, role, xp FROM users WHERE household_id = ? ORDER BY role, name',
    [user.householdId],
  );
  // Só o administrador recebe o código de convite.
  const inviteCode = user.role === 'RESPONSAVEL' ? casa!.inviteCode : null;
  res.json({ name: casa!.name, inviteCode, members });
}));

/** Administrador exclui um usuário da própria casa, com tudo que é dele. */
householdRouter.delete('/members/:id', ah(async (req, res) => {
  const user = req.user!;
  if (user.role !== 'RESPONSAVEL') {
    return res.status(403).json({ error: 'Apenas o administrador pode excluir usuários' });
  }
  const id = Number(req.params.id);
  const alvo = await get<{ id: number; role: string }>(
    'SELECT id, role FROM users WHERE id = ? AND household_id = ?',
    [id, user.householdId],
  );
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado nesta casa' });
  if (alvo.role !== 'ADOLESCENTE') {
    return res.status(400).json({ error: 'Só é possível excluir usuários, não administradores' });
  }

  await atomic([
    { sql: 'DELETE FROM activities WHERE recipient_id = ? OR actor_id = ?', args: [id, id] },
    { sql: 'DELETE FROM redemptions WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [id] },
    { sql: 'DELETE FROM tasks WHERE assignee_id = ?', args: [id] },
    { sql: 'DELETE FROM users WHERE id = ?', args: [id] },
  ]);
  res.json({ ok: true });
}));
