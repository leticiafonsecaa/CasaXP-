import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Banco em memória para não tocar no arquivo real.
process.env.DB_PATH = ':memory:';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createApp } = require('../src/app');

let server: Server;
let base: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

async function api(method: string, path: string, body?: unknown, token?: string) {
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

test('fluxo completo: cadastro, tarefa, conclusão, aprovação e resgate', async () => {
  // 1. Responsável cria a casa
  const resp = await api('POST', '/auth/signup', {
    name: 'Ana',
    email: 'ana@casa.com',
    password: '123456',
    role: 'RESPONSAVEL',
    householdName: 'Casa Silva',
  });
  assert.equal(resp.status, 201);
  assert.ok(resp.data.inviteCode);
  const respToken = resp.data.token;

  // 2. Adolescente entra com o código de convite
  const ado = await api('POST', '/auth/signup', {
    name: 'Pedro',
    email: 'pedro@casa.com',
    password: '123456',
    role: 'ADOLESCENTE',
    inviteCode: resp.data.inviteCode,
  });
  assert.equal(ado.status, 201);
  const adoToken = ado.data.token;
  const adoId = (await api('GET', '/auth/me', undefined, adoToken)).data.user.id;

  // 3. Código inválido e e-mail duplicado são recusados
  const bad = await api('POST', '/auth/signup', {
    name: 'Xico', email: 'x@casa.com', password: '123456', role: 'ADOLESCENTE', inviteCode: 'NOPE',
  });
  assert.equal(bad.status, 400);
  const dup = await api('POST', '/auth/signup', {
    name: 'Yuri', email: 'pedro@casa.com', password: '123456', role: 'ADOLESCENTE', inviteCode: resp.data.inviteCode,
  });
  assert.equal(dup.status, 409);

  // 4. Adolescente não cria tarefa
  const forbidden = await api('POST', '/tasks', { title: 'Lavar louça', xp: 20, assigneeId: adoId }, adoToken);
  assert.equal(forbidden.status, 403);

  // 5. Responsável cria tarefa e recompensa
  const task = await api('POST', '/tasks', { title: 'Lavar louça', xp: 30, assigneeId: adoId }, respToken);
  assert.equal(task.status, 201);
  const reward = await api('POST', '/rewards', { title: 'Sorvete', cost: 50 }, respToken);
  assert.equal(reward.status, 201);

  // 6. Resgate sem XP suficiente é recusado
  const tooEarly = await api('POST', `/rewards/${reward.data.id}/redeem`, undefined, adoToken);
  assert.equal(tooEarly.status, 400);

  // 7. Conclusão aguarda aprovação; aprovar credita XP
  const done = await api('POST', `/tasks/${task.data.id}/complete`, undefined, adoToken);
  assert.equal(done.status, 200);
  const notYet = await api('POST', `/tasks/${task.data.id}/approve`, undefined, respToken);
  assert.equal(notYet.status, 200);
  const again = await api('POST', `/tasks/${task.data.id}/approve`, undefined, respToken);
  assert.equal(again.status, 400, 'não aprova duas vezes');
  assert.equal((await api('GET', '/auth/me', undefined, adoToken)).data.user.xp, 30);

  // 8. Resgate com saldo suficiente após mais uma tarefa aprovada
  const t2 = await api('POST', '/tasks', { title: 'Varrer', xp: 25, assigneeId: adoId }, respToken);
  await api('POST', `/tasks/${t2.data.id}/complete`, undefined, adoToken);
  await api('POST', `/tasks/${t2.data.id}/approve`, undefined, respToken);
  const redeemOk = await api('POST', `/rewards/${reward.data.id}/redeem`, undefined, adoToken);
  assert.equal(redeemOk.status, 200);
  assert.equal(redeemOk.data.xp, 5);

  // 9. Recusa devolve a tarefa para pendente, sem creditar XP
  const t3 = await api('POST', '/tasks', { title: 'Tirar lixo', xp: 10, assigneeId: adoId }, respToken);
  await api('POST', `/tasks/${t3.data.id}/complete`, undefined, adoToken);
  const rej = await api('POST', `/tasks/${t3.data.id}/reject`, undefined, respToken);
  assert.equal(rej.status, 200);
  assert.equal((await api('GET', '/auth/me', undefined, adoToken)).data.user.xp, 5);

  // 10. Adolescente só vê as próprias tarefas; sem token não entra
  const list = await api('GET', '/tasks', undefined, adoToken);
  assert.ok(list.data.tasks.every((t: any) => t.assigneeId === adoId));
  assert.equal((await api('GET', '/tasks')).status, 401);
});

test('login com senha correta e errada', async () => {
  const ok = await api('POST', '/auth/login', { email: 'ana@casa.com', password: '123456' });
  assert.equal(ok.status, 200);
  const bad = await api('POST', '/auth/login', { email: 'ana@casa.com', password: 'errada' });
  assert.equal(bad.status, 401);
});
