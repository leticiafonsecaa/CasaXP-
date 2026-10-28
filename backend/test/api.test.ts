import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { dataHojeBrasil } from '../src/rules';
// Banco temporário: os testes não mexem no banco real.
const arquivoTeste = path.join(os.tmpdir(), `casaxp-teste-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = arquivoTeste;
process.env.TURSO_URL = '';

let server: Server;
let base: string;

before(async () => {
  // Importa só agora, depois de definir DB_PATH.
  const { iniciarBanco } = await import('../src/db');
  await iniciarBanco();
  const { createApp } = await import('../src/app');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as { port: number };
  base = `http://127.0.0.1:${port}/api`;
});

after(async () => {
  server.close();
  const { db } = await import('../src/db');
  db.close();
  // No Windows o arquivo pode continuar aberto por um instante; se não puder apagar, não falha o teste.
  try {
    fs.rmSync(arquivoTeste, { force: true });
  } catch {
    // o arquivo temporário fica na pasta Temp e pode ser apagado depois
  }
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as any };
}

test('fluxo completo: administrador cria, usuário conclui, administrador aprova, usuário resgata', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Casa Teste', email: 'admin@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  assert.equal(admin.status, 201);
  const code = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;

  const usuario = await call('POST', '/auth/signup', {
    name: 'Pedro', email: 'pedro@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  assert.equal(usuario.status, 201);
  const uToken = usuario.data.token;
  const uId = usuario.data.user.id;

  const tarefa = await call('POST', '/tasks', { title: 'Lavar louça', xp: 50, assigneeId: uId }, admin.data.token);
  assert.equal(tarefa.status, 201);

  // Usuário não cria tarefa nem aprova.
  assert.equal((await call('POST', '/tasks', { title: 'X1', xp: 5, assigneeId: uId }, uToken)).status, 403);

  assert.equal((await call('POST', `/tasks/${tarefa.data.id}/complete`, undefined, uToken)).status, 200);
  assert.equal((await call('POST', `/tasks/${tarefa.data.id}/approve`, undefined, admin.data.token)).status, 200);

  const recompensa = await call('POST', '/rewards', { title: 'Sorvete', cost: 30 }, admin.data.token);
  assert.equal(recompensa.status, 201);

  const resgate = await call('POST', `/rewards/${recompensa.data.id}/redeem`, undefined, uToken);
  assert.equal(resgate.status, 200);
  assert.equal(resgate.data.xp, 20);
});

test('não aceita código de convite inválido e não duplica e-mail', async () => {
  const semCodigo = await call('POST', '/auth/signup', {
    name: 'Ana', email: 'ana@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: 'ZZZZZZ',
  });
  assert.equal(semCodigo.status, 400);

  const repetido = await call('POST', '/auth/signup', {
    name: 'Outro', email: 'admin@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  assert.equal(repetido.status, 409);
});

test('login errado não revela se o e-mail existe', async () => {
  const r = await call('POST', '/auth/login', { email: 'admin@teste.com', password: 'errada' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'E-mail ou senha incorretos');
});

test('rotas protegidas exigem login', async () => {
  assert.equal((await call('GET', '/tasks')).status, 401);
});

test('atualizações: administrador recebe conclusão e resgate; usuário recebe só tarefas novas', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Mãe', email: 'mae2@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const code = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;
  const filho = await call('POST', '/auth/signup', {
    name: 'Lucas', email: 'lucas2@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  const fToken = filho.data.token;
  const fId = filho.data.user.id;

  const tarefa = await call('POST', '/tasks', { title: 'Tirar lixo', xp: 40, assigneeId: fId }, admin.data.token);
  const recompensa = await call('POST', '/rewards', { title: 'Cinema', cost: 40 }, admin.data.token);

  // Usuário recebe só o aviso de tarefa nova.
  const minhas = await call('GET', '/activities', undefined, fToken);
  assert.equal(minhas.data.unread, 1);
  assert.equal(minhas.data.activities[0].kind, 'NOVA_TAREFA');

  // Administrador não recebe nada só por criar.
  assert.equal((await call('GET', '/activities', undefined, admin.data.token)).data.unread, 0);

  await call('POST', `/tasks/${tarefa.data.id}/complete`, undefined, fToken);
  await call('POST', `/tasks/${tarefa.data.id}/approve`, undefined, admin.data.token);
  assert.equal((await call('POST', `/rewards/${recompensa.data.id}/redeem`, undefined, fToken)).status, 200);

  // Administrador recebe conclusão e resgate.
  const avisosAdmin = await call('GET', '/activities', undefined, admin.data.token);
  assert.equal(avisosAdmin.data.unread, 2);
  const tipos = avisosAdmin.data.activities.map((a: any) => a.kind);
  assert.ok(tipos.includes('TAREFA_CONCLUIDA'));
  assert.ok(tipos.includes('RECOMPENSA_RESGATADA'));

  // Ao ler, o contador zera.
  await call('POST', '/activities/read', undefined, admin.data.token);
  assert.equal((await call('GET', '/activities', undefined, admin.data.token)).data.unread, 0);
});

test('descrição da tarefa: opcional, salva, devolvida na lista e limitada a 500 caracteres', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Mãe', email: 'mae3@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const code = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;
  const filho = await call('POST', '/auth/signup', {
    name: 'Bia', email: 'bia3@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  const fId = filho.data.user.id;
  const token = admin.data.token;

  const comDesc = await call('POST', '/tasks', {
    title: 'Varrer a sala', xp: 15, assigneeId: fId, description: 'Passar o aspirador embaixo do sofá',
  }, token);
  assert.equal(comDesc.status, 201);
  const semDesc = await call('POST', '/tasks', { title: 'Regar plantas', xp: 10, assigneeId: fId }, token);
  assert.equal(semDesc.status, 201);

  const muitoLonga = await call('POST', '/tasks', {
    title: 'Tarefa longa', xp: 5, assigneeId: fId, description: 'x'.repeat(501),
  }, token);
  assert.equal(muitoLonga.status, 400);

  const lista = (await call('GET', '/tasks', undefined, token)).data.tasks;
  const varrer = lista.find((t: any) => t.title === 'Varrer a sala');
  const regar = lista.find((t: any) => t.title === 'Regar plantas');
  assert.equal(varrer.description, 'Passar o aspirador embaixo do sofá');
  assert.equal(regar.description, null);
});

test('código de convite: aparece só para o administrador', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Pai', email: 'pai4@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const codigo = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;
  assert.ok(codigo);
  const usuario = await call('POST', '/auth/signup', {
    name: 'Ana', email: 'ana4@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: codigo,
  });
  const casaUsuario = await call('GET', '/household', undefined, usuario.data.token);
  assert.equal(casaUsuario.status, 200);
  assert.equal(casaUsuario.data.inviteCode, null);
});

test('tarefa aprovada some no dia seguinte; pendente e concluída continuam aparecendo', async () => {
  const { run } = await import('../src/db');
  const admin = await call('POST', '/auth/signup', {
    name: 'Mãe', email: 'mae5@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const token = admin.data.token;
  const code = (await call('GET', '/household', undefined, token)).data.inviteCode;
  const filho = await call('POST', '/auth/signup', {
    name: 'Bruno', email: 'bruno5@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  const fToken = filho.data.token;
  const fId = filho.data.user.id;

  const aprovada = await call('POST', '/tasks', { title: 'Arrumar cama', xp: 10, assigneeId: fId }, token);
  await call('POST', '/tasks', { title: 'Guardar roupa', xp: 10, assigneeId: fId }, token); // pendente
  const concluida = await call('POST', '/tasks', { title: 'Pôr a mesa', xp: 10, assigneeId: fId }, token);

  await call('POST', `/tasks/${aprovada.data.id}/complete`, undefined, fToken);
  await call('POST', `/tasks/${aprovada.data.id}/approve`, undefined, token);
  await call('POST', `/tasks/${concluida.data.id}/complete`, undefined, fToken); // concluída, não aprovada

  const titulos = async (t: string) =>
    (await call('GET', '/tasks', undefined, t)).data.tasks.map((x: any) => x.title);

  // No dia da aprovação, tudo aparece.
  assert.ok((await titulos(fToken)).includes('Arrumar cama'));

  // Simula o dia seguinte.
  assert.match(dataHojeBrasil(), /^\d{4}-\d{2}-\d{2}$/);
  await run('UPDATE tasks SET approved_on = ? WHERE id = ?', ['2000-01-01', aprovada.data.id]);

  const usuarioVe = await titulos(fToken);
  const adminVe = await titulos(token);
  assert.ok(!usuarioVe.includes('Arrumar cama'));
  assert.ok(!adminVe.includes('Arrumar cama'));
  assert.ok(usuarioVe.includes('Guardar roupa'));
  assert.ok(usuarioVe.includes('Pôr a mesa'));
});

test('administrador exclui usuário da própria casa e o usuário perde o acesso', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Mãe', email: 'mae6@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const code = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;
  const filho = await call('POST', '/auth/signup', {
    name: 'Carla', email: 'carla6@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  const fToken = filho.data.token;
  const fId = filho.data.user.id;

  const tarefa = await call('POST', '/tasks', { title: 'Tirar pó', xp: 10, assigneeId: fId }, admin.data.token);
  await call('POST', `/tasks/${tarefa.data.id}/complete`, undefined, fToken);

  // Usuário não pode excluir ninguém.
  assert.equal((await call('DELETE', `/household/members/${fId}`, undefined, fToken)).status, 403);
  // Administrador não pode ser excluído.
  assert.equal(
    (await call('DELETE', `/household/members/${admin.data.user.id}`, undefined, admin.data.token)).status,
    400,
  );
  // Administrador de outra casa não enxerga esse usuário.
  const outro = await call('POST', '/auth/signup', {
    name: 'Outro', email: 'outro6@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  assert.equal((await call('DELETE', `/household/members/${fId}`, undefined, outro.data.token)).status, 404);

  // Exclusão feita pelo administrador da casa.
  assert.equal((await call('DELETE', `/household/members/${fId}`, undefined, admin.data.token)).status, 200);

  // O usuário perdeu o acesso e sumiu da casa.
  assert.equal((await call('GET', '/tasks', undefined, fToken)).status, 401);
  const casa = (await call('GET', '/household', undefined, admin.data.token)).data;
  assert.ok(!casa.members.some((m: any) => m.id === fId));
  const tarefas = (await call('GET', '/tasks', undefined, admin.data.token)).data.tasks;
  assert.ok(!tarefas.some((t: any) => t.title === 'Tirar pó'));

  // O e-mail fica livre para um novo cadastro.
  const novo = await call('POST', '/auth/signup', {
    name: 'Carla', email: 'carla6@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  assert.equal(novo.status, 201);
});

test('administrador exclui recompensa; usuário não exclui; resgates antigos somem sem devolver XP', async () => {
  const admin = await call('POST', '/auth/signup', {
    name: 'Mãe', email: 'mae7@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  const code = (await call('GET', '/household', undefined, admin.data.token)).data.inviteCode;
  const filho = await call('POST', '/auth/signup', {
    name: 'Davi', email: 'davi7@teste.com', password: 'senha123', role: 'ADOLESCENTE', inviteCode: code,
  });
  const fToken = filho.data.token;
  const fId = filho.data.user.id;

  // Usuário ganha 40 XP e resgata uma recompensa de 20.
  const tarefa = await call('POST', '/tasks', { title: 'Lavar carro', xp: 40, assigneeId: fId }, admin.data.token);
  await call('POST', `/tasks/${tarefa.data.id}/complete`, undefined, fToken);
  await call('POST', `/tasks/${tarefa.data.id}/approve`, undefined, admin.data.token);
  const recompensa = await call('POST', '/rewards', { title: 'Pipoca', cost: 20 }, admin.data.token);
  const resgate = await call('POST', `/rewards/${recompensa.data.id}/redeem`, undefined, fToken);
  assert.equal(resgate.data.xp, 20);

  // Usuário não pode excluir.
  assert.equal((await call('DELETE', `/rewards/${recompensa.data.id}`, undefined, fToken)).status, 403);

  // Administrador de outra casa não enxerga a recompensa.
  const outro = await call('POST', '/auth/signup', {
    name: 'Outra', email: 'outra7@teste.com', password: 'senha123', role: 'RESPONSAVEL',
  });
  assert.equal((await call('DELETE', `/rewards/${recompensa.data.id}`, undefined, outro.data.token)).status, 404);

  // Administrador da casa exclui.
  assert.equal((await call('DELETE', `/rewards/${recompensa.data.id}`, undefined, admin.data.token)).status, 200);

  const lista = (await call('GET', '/rewards', undefined, admin.data.token)).data.rewards;
  assert.ok(!lista.some((r: any) => r.title === 'Pipoca'));

  // XP continua gasto (20), sem devolução.
  const eu = (await call('GET', '/auth/me', undefined, fToken)).data.user;
  assert.equal(eu.xp, 20);
});
