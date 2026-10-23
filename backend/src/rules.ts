// Regras de negócio puras (sem banco, sem HTTP).
// Tudo que é "pode ou não pode" do CasaXP fica aqui.

export type Role = 'RESPONSAVEL' | 'ADOLESCENTE';
export type TaskStatus = 'PENDENTE' | 'AGUARDANDO_APROVACAO' | 'APROVADA';

export const XP_MIN = 1;
export const XP_MAX = 1000;
export const COST_MIN = 1;
export const COST_MAX = 10000;

export interface TaskRef {
  assigneeId: number;
  status: TaskStatus;
}

/** Só o responsável cria tarefas, aprova/recusa e cria recompensas. */
export function canManage(role: Role): boolean {
  return role === 'RESPONSAVEL';
}

/** Adolescente conclui só a própria tarefa, e só enquanto ela estiver pendente. */
export function canCompleteTask(userId: number, role: Role, task: TaskRef): boolean {
  return role === 'ADOLESCENTE' && task.assigneeId === userId && task.status === 'PENDENTE';
}

/** Só dá para aprovar ou recusar o que foi marcado como concluído. */
export function canReviewTask(task: TaskRef): boolean {
  return task.status === 'AGUARDANDO_APROVACAO';
}

/** Adolescente resgata recompensa se tiver XP suficiente. */
export function canRedeem(role: Role, balance: number, cost: number): boolean {
  return role === 'ADOLESCENTE' && balance >= cost;
}

export function validateXp(xp: unknown): string | null {
  if (typeof xp !== 'number' || !Number.isInteger(xp)) return 'XP deve ser um número inteiro';
  if (xp < XP_MIN || xp > XP_MAX) return `XP deve estar entre ${XP_MIN} e ${XP_MAX}`;
  return null;
}

export function validateCost(cost: unknown): string | null {
  if (typeof cost !== 'number' || !Number.isInteger(cost)) return 'Custo deve ser um número inteiro';
  if (cost < COST_MIN || cost > COST_MAX) return `Custo deve estar entre ${COST_MIN} e ${COST_MAX}`;
  return null;
}

export function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'E-mail inválido';
  return null;
}

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 6) return 'A senha deve ter pelo menos 6 caracteres';
  return null;
}
