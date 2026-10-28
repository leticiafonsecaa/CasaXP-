// Modo demonstração (só front): simula a API inteira dentro do navegador.
// Usado apenas no build "demo" (npm run build:demo). Os dados ficam só neste navegador.

type Papel = 'RESPONSAVEL' | 'ADOLESCENTE';

interface Usuario { id: number; name: string; email: string; senha: string; role: Papel; xp: number }
interface Tarefa { id: number; title: string; description: string | null; xp: number; status: string; assignee_id: number; approved_on: string | null }
interface Recompensa { id: number; title: string; cost: number }
interface Atividade { id: number; recipient_id: number; actor_id: number; kind: string; title: string; amount: number; description: string | null; read: number; created_at: string }
interface Banco {
  nextId: number;
  users: Usuario[];
  tasks: Tarefa[];
  rewards: Recompensa[];
  redemptions: { reward_id: number; user_id: number }[];
  activities: Atividade[];
  sessions: Record<string, number>;
}

export interface Resposta { status: number; data: any }

const CHAVE = 'casaxp_demo_v2';
const CODIGO = 'DEMO01';
const NOME_CASA = 'Casa Demo';
const memoria = new Map<string, string>();

function ler(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(CHAVE) : memoria.get(CHAVE) ?? null;
}
function guardar(texto: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CHAVE, texto);
  else memoria.set(CHAVE, texto);
}

function bancoInicial(): Banco {
  return {
    nextId: 10,
    users: [
      { id: 1, name: 'Administrador Demo', email: 'admin@demo.casaxp', senha: 'demo1234', role: 'RESPONSAVEL', xp: 0 },
      { id: 2, name: 'Usuário Demo', email: 'usuario@demo.casaxp', senha: 'demo1234', role: 'ADOLESCENTE', xp: 0 },
    ],
    tasks: [
      { id: 1, title: 'Arrumar a cama', description: 'Deixar o lençol esticado e o travesseiro no lugar.', xp: 10, status: 'PENDENTE', assignee_id: 2, approved_on: null },
    ],
    rewards: [{ id: 2, title: 'Escolher o filme da noite', cost: 30 }],
    redemptions: [],
    activities: [],
    sessions: {},
  };
}

function carregar(): Banco {
  const texto = ler();
  if (!texto) {
    const inicial = bancoInicial();
    guardar(JSON.stringify(inicial));
    return inicial;
  }
  return JSON.parse(texto) as Banco;
}

function salvar(b: Banco): void {
  guardar(JSON.stringify(b));
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD), igual ao servidor. */
function dataHoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const ok = (data: any, status = 200): Resposta => ({ status, data });
const erro = (mensagem: string, status: number): Resposta => ({ status, data: { error: mensagem } });

function publico(u: Usuario) {
  return { id: u.id, householdId: 1, name: u.name, email: u.email, role: u.role, xp: u.xp };
}
function nomeDe(b: Banco, id: number): string {
  return b.users.find((u) => u.id === id)?.name ?? '';
}
function idsAdmins(b: Banco): number[] {
  return b.users.filter((u) => u.role === 'RESPONSAVEL').map((u) => u.id);
}
function registrarAtividade(b: Banco, e: { recipients: number[]; actor: number; kind: string; title: string; amount: number; description?: string | null }) {
  const agora = new Date().toISOString().replace('T', ' ').slice(0, 19);
  for (const r of e.recipients) {
    b.activities.push({
      id: b.nextId++, recipient_id: r, actor_id: e.actor, kind: e.kind, title: e.title,
      amount: e.amount, description: e.description ?? null, read: 0, created_at: agora,
    });
  }
}
function tarefasVisiveis(b: Banco, u: Usuario) {
  const hoje = dataHoje();
  return b.tasks
    .filter((t) => (u.role === 'RESPONSAVEL' || t.assignee_id === u.id))
    .filter((t) => t.status !== 'APROVADA' || (t.approved_on !== null && t.approved_on >= hoje))
    .sort((a, b2) => b2.id - a.id)
    .map((t) => ({
      id: t.id, title: t.title, description: t.description, xp: t.xp, status: t.status,
      assigneeId: t.assignee_id, assigneeName: nomeDe(b, t.assignee_id),
    }));
}

function rotear(metodo: string, caminho: string, corpo: any, token: string | null, b: Banco): Resposta {
  const usuario = token && b.sessions[token] !== undefined ? b.users.find((u) => u.id === b.sessions[token]) : undefined;

  if (metodo === 'GET' && caminho === '/config') return ok({ demo: true });

  if (metodo === 'POST' && caminho === '/demo/login') {
    const papel = corpo?.papel;
    if (papel !== 'admin' && papel !== 'usuario') return erro('Escolha admin ou usuario', 400);
    const alvo = b.users.find((u) => u.email === (papel === 'admin' ? 'admin@demo.casaxp' : 'usuario@demo.casaxp'))!;
    const novoToken = Math.random().toString(16).slice(2) + Date.now().toString(16);
    b.sessions[novoToken] = alvo.id;
    return ok({ token: novoToken, user: publico(alvo) });
  }

  if (metodo === 'POST' && caminho === '/auth/login') {
    const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';
    const alvo = b.users.find((u) => u.email === email);
    if (!alvo || alvo.senha !== corpo?.password) return erro('E-mail ou senha incorretos', 401);
    const novoToken = Math.random().toString(16).slice(2) + Date.now().toString(16);
    b.sessions[novoToken] = alvo.id;
    return ok({ token: novoToken, user: publico(alvo) });
  }

  if (metodo === 'POST' && caminho === '/auth/signup') {
    const { name, email, password, role, inviteCode } = corpo ?? {};
    if (typeof name !== 'string' || name.trim().length < 2) return erro('Informe seu nome', 400);
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('E-mail inválido', 400);
    if (typeof password !== 'string' || password.length < 6) return erro('A senha deve ter pelo menos 6 caracteres', 400);
    if (role !== 'RESPONSAVEL' && role !== 'ADOLESCENTE') return erro('Escolha se é Administrador ou Usuário', 400);
    const emailNormalizado = email.trim().toLowerCase();
    if (b.users.some((u) => u.email === emailNormalizado)) return erro('Este e-mail já está cadastrado', 409);
    if (role === 'ADOLESCENTE' && (typeof inviteCode !== 'string' || inviteCode.trim().toUpperCase() !== CODIGO)) {
      return erro('Código de convite inválido', 400);
    }
    const novo: Usuario = { id: b.nextId++, name: name.trim(), email: emailNormalizado, senha: password, role, xp: 0 };
    b.users.push(novo);
    const novoToken = Math.random().toString(16).slice(2) + Date.now().toString(16);
    b.sessions[novoToken] = novo.id;
    return ok({ token: novoToken, user: publico(novo) }, 201);
  }

  if (metodo === 'POST' && caminho === '/auth/logout') {
    if (token) delete b.sessions[token];
    return ok({ ok: true });
  }

  if (!usuario) return erro('Não autenticado', 401);
  const ehAdmin = usuario.role === 'RESPONSAVEL';

  if (metodo === 'GET' && caminho === '/auth/me') return ok({ user: publico(usuario) });

  if (metodo === 'GET' && caminho === '/household') {
    const membros = [...b.users]
      .sort((x, y) => (x.role === y.role ? x.name.localeCompare(y.name) : x.role.localeCompare(y.role)))
      .map((u) => ({ id: u.id, name: u.name, role: u.role, xp: u.xp }));
    return ok({ name: NOME_CASA, inviteCode: ehAdmin ? CODIGO : null, members: membros });
  }

  const membro = caminho.match(/^\/household\/members\/(\d+)$/);
  if (metodo === 'DELETE' && membro) {
    if (!ehAdmin) return erro('Apenas o administrador pode excluir usuários', 403);
    const id = Number(membro[1]);
    const alvo = b.users.find((u) => u.id === id);
    if (!alvo) return erro('Usuário não encontrado nesta casa', 404);
    if (alvo.role !== 'ADOLESCENTE') return erro('Só é possível excluir usuários, não administradores', 400);
    b.activities = b.activities.filter((a) => a.recipient_id !== id && a.actor_id !== id);
    b.redemptions = b.redemptions.filter((r) => r.user_id !== id);
    for (const t of Object.keys(b.sessions)) if (b.sessions[t] === id) delete b.sessions[t];
    b.tasks = b.tasks.filter((t) => t.assignee_id !== id);
    b.users = b.users.filter((u) => u.id !== id);
    return ok({ ok: true });
  }

  if (caminho === '/tasks' && metodo === 'GET') return ok({ tasks: tarefasVisiveis(b, usuario) });

  if (caminho === '/tasks' && metodo === 'POST') {
    if (!ehAdmin) return erro('Apenas o administrador cria tarefas', 403);
    const { title, xp, assigneeId, description } = corpo ?? {};
    if (typeof title !== 'string' || title.trim().length < 2) return erro('Informe o título da tarefa', 400);
    if (!Number.isInteger(xp) || xp < 1 || xp > 1000) return erro('XP deve estar entre 1 e 1000', 400);
    const assignee = b.users.find((u) => u.id === Number(assigneeId) && u.role === 'ADOLESCENTE');
    if (!assignee) return erro('Escolha um usuário da casa para a tarefa', 400);
    if (description != null && (typeof description !== 'string' || description.length > 500)) {
      return erro('A descrição deve ter até 500 caracteres', 400);
    }
    const descricao = typeof description === 'string' && description.trim() ? description.trim() : null;
    const id = b.nextId++;
    b.tasks.push({ id, title: title.trim(), description: descricao, xp, status: 'PENDENTE', assignee_id: assignee.id, approved_on: null });
    registrarAtividade(b, { recipients: [assignee.id], actor: usuario.id, kind: 'NOVA_TAREFA', title: title.trim(), amount: xp, description: descricao });
    return ok({ id }, 201);
  }

  const tarefa = caminho.match(/^\/tasks\/(\d+)\/(complete|approve|reject)$/);
  if (metodo === 'POST' && tarefa) {
    const t = b.tasks.find((x) => x.id === Number(tarefa[1]));
    if (!t) return erro('Tarefa não encontrada', 404);
    const acao = tarefa[2];
    if (acao === 'complete') {
      if (usuario.role !== 'ADOLESCENTE' || t.assignee_id !== usuario.id || t.status !== 'PENDENTE') {
        return erro('Esta tarefa não pode ser concluída agora', 403);
      }
      t.status = 'AGUARDANDO_APROVACAO';
      registrarAtividade(b, { recipients: idsAdmins(b), actor: usuario.id, kind: 'TAREFA_CONCLUIDA', title: t.title, amount: t.xp });
      return ok({ ok: true });
    }
    if (!ehAdmin) return erro(acao === 'approve' ? 'Apenas o administrador aprova' : 'Apenas o administrador recusa', 403);
    if (t.status !== 'AGUARDANDO_APROVACAO') return erro('Esta tarefa não está aguardando aprovação', 400);
    if (acao === 'approve') {
      t.status = 'APROVADA';
      t.approved_on = dataHoje();
      const dono = b.users.find((u) => u.id === t.assignee_id);
      if (dono) dono.xp += t.xp;
    } else {
      t.status = 'PENDENTE';
    }
    return ok({ ok: true });
  }

  if (caminho === '/rewards' && metodo === 'GET') {
    return ok({ rewards: [...b.rewards].sort((x, y) => x.cost - y.cost).map((r) => ({ id: r.id, title: r.title, cost: r.cost })) });
  }

  if (caminho === '/rewards' && metodo === 'POST') {
    if (!ehAdmin) return erro('Apenas o administrador cria recompensas', 403);
    const { title, cost } = corpo ?? {};
    if (typeof title !== 'string' || title.trim().length < 2) return erro('Informe o nome da recompensa', 400);
    if (!Number.isInteger(cost) || cost < 1 || cost > 10000) return erro('Custo deve estar entre 1 e 10000', 400);
    const id = b.nextId++;
    b.rewards.push({ id, title: title.trim(), cost });
    return ok({ id }, 201);
  }

  const resgate = caminho.match(/^\/rewards\/(\d+)\/redeem$/);
  if (metodo === 'POST' && resgate) {
    const r = b.rewards.find((x) => x.id === Number(resgate[1]));
    if (!r) return erro('Recompensa não encontrada', 404);
    if (usuario.role !== 'ADOLESCENTE' || usuario.xp < r.cost) return erro('XP insuficiente para este resgate', 400);
    usuario.xp -= r.cost;
    b.redemptions.push({ reward_id: r.id, user_id: usuario.id });
    registrarAtividade(b, { recipients: idsAdmins(b), actor: usuario.id, kind: 'RECOMPENSA_RESGATADA', title: r.title, amount: r.cost });
    return ok({ ok: true, xp: usuario.xp });
  }

  const excluirRecompensa = caminho.match(/^\/rewards\/(\d+)$/);
  if (metodo === 'DELETE' && excluirRecompensa) {
    if (!ehAdmin) return erro('Apenas o administrador exclui recompensas', 403);
    const id = Number(excluirRecompensa[1]);
    if (!b.rewards.some((r) => r.id === id)) return erro('Recompensa não encontrada', 404);
    b.redemptions = b.redemptions.filter((r) => r.reward_id !== id);
    b.rewards = b.rewards.filter((r) => r.id !== id);
    return ok({ ok: true });
  }

  if (caminho === '/activities' && metodo === 'GET') {
    const minhas = b.activities.filter((a) => a.recipient_id === usuario.id).sort((x, y) => y.id - x.id).slice(0, 50);
    return ok({
      activities: minhas.map((a) => ({
        id: a.id, kind: a.kind, title: a.title, amount: a.amount, description: a.description,
        read: a.read, createdAt: a.created_at, actorName: nomeDe(b, a.actor_id),
      })),
      unread: b.activities.filter((a) => a.recipient_id === usuario.id && a.read === 0).length,
    });
  }

  if (caminho === '/activities/read' && metodo === 'POST') {
    for (const a of b.activities) if (a.recipient_id === usuario.id) a.read = 1;
    return ok({ ok: true });
  }

  return erro('Não encontrado', 404);
}

/** Ponto de entrada usado pelo api.ts quando o build é o de demonstração. */
export async function demoRequest(metodo: string, caminho: string, corpo: any, token: string | null): Promise<Resposta> {
  const banco = carregar();
  const resposta = rotear(metodo, caminho.split('?')[0], corpo, token, banco);
  salvar(banco);
  return resposta;
}
