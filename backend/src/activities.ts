import { db } from './db';

export type ActivityKind = 'TAREFA_CONCLUIDA' | 'RECOMPENSA_RESGATADA' | 'NOVA_TAREFA';

interface Evento {
  householdId: number;
  recipientIds: number[];
  actorId: number;
  kind: ActivityKind;
  title: string;
  amount: number;
  description?: string | null;
}

/** Grava um aviso para cada destinatário. Chamado pelas rotas de tarefas e recompensas. */
export function registrarAtividade(e: Evento): void {
  const stmt = db.prepare(
    'INSERT INTO activities (household_id, recipient_id, actor_id, kind, title, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const recipientId of e.recipientIds) {
    stmt.run(e.householdId, recipientId, e.actorId, e.kind, e.title, e.amount, e.description ?? null);
  }
}

/** Ids de todos os administradores da casa. */
export function administradoresDaCasa(householdId: number): number[] {
  const rows = db
    .prepare("SELECT id FROM users WHERE household_id = ? AND role = 'RESPONSAVEL'")
    .all(householdId) as unknown as { id: number }[];
  return rows.map((r) => r.id);
}
