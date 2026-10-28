import { Router } from 'express';
import { db } from '../db';

export const activitiesRouter = Router();

/** Lista as atualizações do usuário logado e quantas ainda não foram vistas. */
activitiesRouter.get('/', (req, res) => {
  const user = req.user!;
  const activities = db
    .prepare(
      `SELECT a.id, a.kind, a.title, a.amount, a.description, a.read, a.created_at AS createdAt, u.name AS actorName
         FROM activities a JOIN users u ON u.id = a.actor_id
        WHERE a.recipient_id = ?
        ORDER BY a.id DESC
        LIMIT 50`,
    )
    .all(user.id);
  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM activities WHERE recipient_id = ? AND read = 0')
    .get(user.id) as { n: number };
  res.json({ activities, unread: n });
});

/** Marca como vistas as atualizações do usuário logado. */
activitiesRouter.post('/read', (req, res) => {
  db.prepare('UPDATE activities SET read = 1 WHERE recipient_id = ? AND read = 0').run(req.user!.id);
  res.json({ ok: true });
});
