import { Router } from 'express';
import { db, tx } from '../db';
import { canCompleteTask, canManage, canReviewTask, validateXp, type TaskStatus } from '../rules';

export const tasksRouter = Router();

interface TaskRow {
  id: number;
  household_id: number;
  title: string;
  xp: number;
  assignee_id: number;
  status: TaskStatus;
}

function findTask(id: number, householdId: number): TaskRow | undefined {
  return db
    .prepare('SELECT * FROM tasks WHERE id = ? AND household_id = ?')
    .get(id, householdId) as TaskRow | undefined;
}

/** Responsável vê todas as tarefas da casa; adolescente vê só as suas. */
tasksRouter.get('/', (req, res) => {
  const user = req.user!;
  const base = `SELECT t.id, t.title, t.xp, t.status, t.assignee_id AS assigneeId,
                       u.name AS assigneeName
                  FROM tasks t JOIN users u ON u.id = t.assignee_id
                 WHERE t.household_id = ?`;
  const rows = canManage(user.role)
    ? db.prepare(`${base} ORDER BY t.id DESC`).all(user.householdId)
    : db.prepare(`${base} AND t.assignee_id = ? ORDER BY t.id DESC`).all(user.householdId, user.id);
  res.json({ tasks: rows });
});

/** Só o responsável cria tarefa, atribuindo a um membro adolescente da casa. */
tasksRouter.post('/', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o responsável cria tarefas' });

  const { title, xp, assigneeId } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 2) {
    return res.status(400).json({ error: 'Informe o título da tarefa' });
  }
  const xpErr = validateXp(xp);
  if (xpErr) return res.status(400).json({ error: xpErr });

  const assignee = db
    .prepare('SELECT id FROM users WHERE id = ? AND household_id = ? AND role = ?')
    .get(assigneeId, user.householdId, 'ADOLESCENTE');
  if (!assignee) return res.status(400).json({ error: 'Atribua a tarefa a um adolescente da casa' });

  const info = db
    .prepare('INSERT INTO tasks (household_id, title, xp, assignee_id) VALUES (?, ?, ?, ?)')
    .run(user.householdId, title.trim(), xp, assigneeId);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

/** Adolescente marca a própria tarefa como concluída (aguardando aprovação). */
tasksRouter.post('/:id/complete', (req, res) => {
  const user = req.user!;
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canCompleteTask(user.id, user.role, { assigneeId: task.assignee_id, status: task.status })) {
    return res.status(403).json({ error: 'Esta tarefa não pode ser concluída agora' });
  }
  db.prepare("UPDATE tasks SET status = 'AGUARDANDO_APROVACAO' WHERE id = ?").run(task.id);
  res.json({ ok: true });
});

/** Responsável aprova: credita o XP ao adolescente, na mesma transação. */
tasksRouter.post('/:id/approve', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o responsável aprova' });
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canReviewTask({ assigneeId: task.assignee_id, status: task.status })) {
    return res.status(400).json({ error: 'Esta tarefa não está aguardando aprovação' });
  }
  tx(() => {
    db.prepare("UPDATE tasks SET status = 'APROVADA' WHERE id = ?").run(task.id);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(task.xp, task.assignee_id);
  });
  res.json({ ok: true });
});

/** Responsável recusa: a tarefa volta a ficar pendente, sem XP. */
tasksRouter.post('/:id/reject', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o responsável recusa' });
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canReviewTask({ assigneeId: task.assignee_id, status: task.status })) {
    return res.status(400).json({ error: 'Esta tarefa não está aguardando aprovação' });
  }
  db.prepare("UPDATE tasks SET status = 'PENDENTE' WHERE id = ?").run(task.id);
  res.json({ ok: true });
});
