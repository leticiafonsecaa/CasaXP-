import { all, atomic } from './db';

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
export async function registrarAtividade(e: Evento): Promise<void> {
  if (e.recipientIds.length === 0) return;
  await atomic(
    e.recipientIds.map((recipientId) => ({
      sql: 'INSERT INTO activities (household_id, recipient_id, actor_id, kind, title, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [e.householdId, recipientId, e.actorId, e.kind, e.title, e.amount, e.description ?? null],
    })),
  );
}

/** Ids de todos os administradores da casa. */
export async function administradoresDaCasa(householdId: number): Promise<number[]> {
  const rows = await all<{ id: number }>(
    "SELECT id FROM users WHERE household_id = ? AND role = 'RESPONSAVEL'",
    [householdId],
  );
  return rows.map((r) => Number(r.id));
}
