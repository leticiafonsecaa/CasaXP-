import { db } from './src/db';

async function resetar() {
  const resultado = await db.execute(`
    SELECT id, household_id
    FROM users
    WHERE role = 'ADOLESCENTE'
    LIMIT 1
  `);

  if (resultado.rows.length === 0) {
    throw new Error('Nenhum adolescente encontrado.');
  }

  const householdId = Number(resultado.rows[0][1]);

  await db.batch([
    {
      sql: 'DELETE FROM activities WHERE household_id = ?',
      args: [householdId],
    },
    {
      sql: 'DELETE FROM tasks WHERE household_id = ?',
      args: [householdId],
    },
    {
      sql: `UPDATE users SET xp = 0
            WHERE household_id = ? AND role = 'ADOLESCENTE'`,
      args: [householdId],
    },
  ], 'write');

  console.log('Limpeza concluída!');
  await db.close();
}

resetar().catch(console.error);