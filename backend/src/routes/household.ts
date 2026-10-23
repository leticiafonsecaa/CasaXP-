import { Router } from 'express';
import { db } from '../db';

export const householdRouter = Router();

/** Dados da casa do usuário logado e os membros. */
householdRouter.get('/', (req, res) => {
  const user = req.user!;
  const household = db
    .prepare('SELECT id, name, invite_code AS inviteCode FROM households WHERE id = ?')
    .get(user.householdId);
  const members = db
    .prepare('SELECT id, name, role, xp FROM users WHERE household_id = ? ORDER BY name')
    .all(user.householdId);
  res.json({ household, members });
});
