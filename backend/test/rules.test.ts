import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCompleteTask, canManage, canRedeem, canReviewTask, dataHojeBrasil, validateXp } from '../src/rules';

test('só o administrador gerencia', () => {
  assert.equal(canManage('RESPONSAVEL'), true);
  assert.equal(canManage('ADOLESCENTE'), false);
});

test('usuário só conclui a própria tarefa pendente', () => {
  assert.equal(canCompleteTask(2, 'ADOLESCENTE', { assigneeId: 2, status: 'PENDENTE' }), true);
  assert.equal(canCompleteTask(3, 'ADOLESCENTE', { assigneeId: 2, status: 'PENDENTE' }), false);
  assert.equal(canCompleteTask(2, 'ADOLESCENTE', { assigneeId: 2, status: 'APROVADA' }), false);
});

test('só revisa tarefa aguardando aprovação', () => {
  assert.equal(canReviewTask({ assigneeId: 2, status: 'AGUARDANDO_APROVACAO' }), true);
  assert.equal(canReviewTask({ assigneeId: 2, status: 'PENDENTE' }), false);
});

test('resgate exige saldo suficiente', () => {
  assert.equal(canRedeem('ADOLESCENTE', 100, 100), true);
  assert.equal(canRedeem('ADOLESCENTE', 99, 100), false);
  assert.equal(canRedeem('RESPONSAVEL', 500, 100), false);
});

test('valida XP', () => {
  assert.notEqual(validateXp(0), null);
  assert.notEqual(validateXp(1.5), null);
  assert.equal(validateXp(10), null);
});

test('data de hoje usa o fuso de Brasília (madrugada UTC ainda é o dia anterior)', () => {
  assert.equal(dataHojeBrasil(new Date('2026-10-28T02:30:00Z')), '2026-10-27');
  assert.equal(dataHojeBrasil(new Date('2026-10-28T15:00:00Z')), '2026-10-28');
});
