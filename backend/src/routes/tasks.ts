import { Router } from 'express';
import { db, tx } from '../db';
import { administradoresDaCasa, registrarAtividade } from '../activities';
import { canCompleteTask, canManage, canReviewTask, dataHojeBrasil, validateXp, type TaskStatus } from '../rules';

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
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND household_id = ?').get(id, householdId) as
    | TaskRow
    | undefined;
}

/**
 * Administrador vê todas as tarefas da casa; usuário vê só as suas.
 * Tarefa aprovada some no dia seguinte à aprovação. As outras continuam até serem aprovadas.
 */
tasksRouter.get('/', (req, res) => {
  const user = req.user!;
  const hoje = dataHojeBrasil();
  const base = `SELECT t.id, t.title, t.description, t.xp, t.status, t.assignee_id AS assigneeId, u.name AS assigneeName
                  FROM tasks t JOIN users u ON u.id = t.assignee_id
                 WHERE t.household_id = ?
                   AND (t.status != 'APROVADA' OR t.approved_on >= ?)`;
  const rows = canManage(user.role)
    ? db.prepare(`${base} ORDER BY t.id DESC`).all(user.householdId, hoje)
    : db.prepare(`${base} AND t.assignee_id = ? ORDER BY t.id DESC`).all(user.householdId, hoje, user.id);
  res.json({ tasks: rows });
});

/** Só o administrador cria tarefa, atribuindo a um usuário da casa. */
tasksRouter.post('/', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o administrador cria tarefas' });

  const { title, xp, assigneeId, description } = req.body ?? {};
  if (typeof title !== 'string' || title.trim().length < 2) {
    return res.status(400).json({ error: 'Informe o título da tarefa' });
  }
  const xpErr = validateXp(xp);
  if (xpErr) return res.status(400).json({ error: xpErr });

  const assignee = db
    .prepare('SELECT id FROM users WHERE id = ? AND household_id = ? AND role = ?')
    .get(assigneeId, user.householdId, 'ADOLESCENTE');
  if (!assignee) return res.status(400).json({ error: 'Escolha um usuário da casa para a tarefa' });

  // Descrição é opcional, com limite de 500 caracteres.
  if (description !== undefined && description !== null && (typeof description !== 'string' || description.length > 500)) {
    return res.status(400).json({ error: 'A descrição deve ter até 500 caracteres' });
  }
  const descricaoLimpa = typeof description === 'string' && description.trim() ? description.trim() : null;

  const info = db
    .prepare('INSERT INTO tasks (household_id, title, xp, assignee_id, description) VALUES (?, ?, ?, ?, ?)')
    .run(user.householdId, title.trim(), xp, assigneeId, descricaoLimpa);

  // Avisa o usuário que recebeu a tarefa nova.
  registrarAtividade({
    householdId: user.householdId,
    recipientIds: [Number(assigneeId)],
    actorId: user.id,
    kind: 'NOVA_TAREFA',
    title: title.trim(),
    amount: xp,
    description: descricaoLimpa,
  });
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

/** O usuário marca a própria tarefa como feita (fica aguardando aprovação). */
tasksRouter.post('/:id/complete', (req, res) => {
  const user = req.user!;
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canCompleteTask(user.id, user.role, { assigneeId: task.assignee_id, status: task.status })) {
    return res.status(403).json({ error: 'Esta tarefa não pode ser concluída agora' });
  }
  db.prepare("UPDATE tasks SET status = 'AGUARDANDO_APROVACAO' WHERE id = ?").run(task.id);

  // Avisa todos os administradores da casa.
  registrarAtividade({
    householdId: user.householdId,
    recipientIds: administradoresDaCasa(user.householdId),
    actorId: user.id,
    kind: 'TAREFA_CONCLUIDA',
    title: task.title,
    amount: task.xp,
  });
  res.json({ ok: true });
});

/** O administrador aprova: credita o XP ao usuário, na mesma transação. */
tasksRouter.post('/:id/approve', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o administrador aprova' });
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canReviewTask({ assigneeId: task.assignee_id, status: task.status })) {
    return res.status(400).json({ error: 'Esta tarefa não está aguardando aprovação' });
  }
  tx(() => {
    db.prepare("UPDATE tasks SET status = 'APROVADA', approved_on = ? WHERE id = ?").run(dataHojeBrasil(), task.id);
    db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(task.xp, task.assignee_id);
  });
  res.json({ ok: true });
});

/** O administrador recusa: a tarefa volta a ficar pendente, sem XP. */
tasksRouter.post('/:id/reject', (req, res) => {
  const user = req.user!;
  if (!canManage(user.role)) return res.status(403).json({ error: 'Apenas o administrador recusa' });
  const task = findTask(Number(req.params.id), user.householdId);
  if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });
  if (!canReviewTask({ assigneeId: task.assignee_id, status: task.status })) {
    return res.status(400).json({ error: 'Esta tarefa não está aguardando aprovação' });
  }
  db.prepare("UPDATE tasks SET status = 'PENDENTE' WHERE id = ?").run(task.id);
  res.json({ ok: true });
});
