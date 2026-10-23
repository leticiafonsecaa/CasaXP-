import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../src/rules';

test('somente responsável gerencia', () => {
  assert.equal(r.canManage('RESPONSAVEL'), true);
  assert.equal(r.canManage('ADOLESCENTE'), false);
});

test('adolescente conclui só a própria tarefa pendente', () => {
  const pendente = { assigneeId: 2, status: 'PENDENTE' as const };
  assert.equal(r.canCompleteTask(2, 'ADOLESCENTE', pendente), true);
  assert.equal(r.canCompleteTask(3, 'ADOLESCENTE', pendente), false);
  assert.equal(r.canCompleteTask(2, 'RESPONSAVEL', pendente), false);
  assert.equal(r.canCompleteTask(2, 'ADOLESCENTE', { assigneeId: 2, status: 'APROVADA' }), false);
});

test('só tarefa aguardando aprovação pode ser revisada', () => {
  assert.equal(r.canReviewTask({ assigneeId: 1, status: 'AGUARDANDO_APROVACAO' }), true);
  assert.equal(r.canReviewTask({ assigneeId: 1, status: 'PENDENTE' }), false);
  assert.equal(r.canReviewTask({ assigneeId: 1, status: 'APROVADA' }), false);
});

test('resgate exige saldo suficiente e papel adolescente', () => {
  assert.equal(r.canRedeem('ADOLESCENTE', 50, 50), true);
  assert.equal(r.canRedeem('ADOLESCENTE', 49, 50), false);
  assert.equal(r.canRedeem('RESPONSAVEL', 999, 1), false);
});

test('validações de XP, custo, e-mail e senha', () => {
  assert.notEqual(r.validateXp(0), null);
  assert.notEqual(r.validateXp(1.5), null);
  assert.equal(r.validateXp(10), null);
  assert.notEqual(r.validateCost(-1), null);
  assert.equal(r.validateCost(100), null);
  assert.notEqual(r.validateEmail('abc'), null);
  assert.equal(r.validateEmail('a@b.com'), null);
  assert.notEqual(r.validatePassword('123'), null);
  assert.equal(r.validatePassword('123456'), null);
});
