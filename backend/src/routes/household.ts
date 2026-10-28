import { Router } from 'express';
import { db, tx } from '../db';

export const householdRouter = Router();

/** Mostra o nome da casa, os membros e, só para o administrador, o código de convite. */
householdRouter.get('/', (req, res) => {
  const user = req.user!;
  const casa = db.prepare('SELECT name, invite_code AS inviteCode FROM households WHERE id = ?')
    .get(user.householdId) as { name: string; inviteCode: string };
  const members = db
    .prepare('SELECT id, name, role, xp FROM users WHERE household_id = ? ORDER BY role, name')
    .all(user.householdId);
  // Só o administrador recebe o código de convite.
  const inviteCode = user.role === 'RESPONSAVEL' ? casa.inviteCode : null;
  res.json({ name: casa.name, inviteCode, members });
});

/** Administrador exclui um usuário da própria casa, com tudo que é dele. */
householdRouter.delete('/members/:id', (req, res) => {
  const user = req.user!;
  if (user.role !== 'RESPONSAVEL') {
    return res.status(403).json({ error: 'Apenas o administrador pode excluir usuários' });
  }
  const id = Number(req.params.id);
  const alvo = db
    .prepare('SELECT id, role FROM users WHERE id = ? AND household_id = ?')
    .get(id, user.householdId) as { id: number; role: string } | undefined;
  if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado nesta casa' });
  if (alvo.role !== 'ADOLESCENTE') {
    return res.status(400).json({ error: 'Só é possível excluir usuários, não administradores' });
  }

  tx(() => {
    db.prepare('DELETE FROM activities WHERE recipient_id = ? OR actor_id = ?').run(id, id);
    db.prepare('DELETE FROM redemptions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM tasks WHERE assignee_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});
