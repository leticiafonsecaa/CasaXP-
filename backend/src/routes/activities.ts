import { Router } from 'express';
import { all, get, run } from '../db';
import { ah } from '../http';

export const activitiesRouter = Router();

/** Lista as atualizações do usuário logado e quantas ainda não foram vistas. */
activitiesRouter.get('/', ah(async (req, res) => {
  const user = req.user!;
  const activities = await all(
    `SELECT a.id, a.kind, a.title, a.amount, a.description, a.read, a.created_at AS createdAt, u.name AS actorName
       FROM activities a JOIN users u ON u.id = a.actor_id
      WHERE a.recipient_id = ?
      ORDER BY a.id DESC
      LIMIT 50`,
    [user.id],
  );
  const contagem = await get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM activities WHERE recipient_id = ? AND read = 0',
    [user.id],
  );
  res.json({ activities, unread: Number(contagem?.n ?? 0) });
}));

/** Marca como vistas as atualizações do usuário logado. */
activitiesRouter.post('/read', ah(async (req, res) => {
  await run('UPDATE activities SET read = 1 WHERE recipient_id = ? AND read = 0', [req.user!.id]);
  res.json({ ok: true });
}));
