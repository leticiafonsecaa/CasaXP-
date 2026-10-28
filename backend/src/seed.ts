// Cria uma casa de demonstração com um Administrador e um Usuário, para mostrar o app.
// Uso: npm run seed (dentro de backend/). Se as contas já existirem, não faz nada.
//
// ATENÇÃO: as senhas são conhecidas. Use este comando só no banco de teste ou de demonstração,
// nunca no banco com dados de famílias reais.
import { hashPassword } from './auth';
import { atomic, db, get, iniciarBanco } from './db';

const EMAIL_ADMIN = 'admin@demo.casaxp';
const EMAIL_USUARIO = 'usuario@demo.casaxp';
const SENHA = 'demo1234';
const CODIGO = 'DEMO01';

async function main() {
  await iniciarBanco();

  const existe = await get('SELECT id FROM users WHERE email = ?', [EMAIL_ADMIN]);
  if (existe) {
    console.log('As contas de demonstração já existem.');
    console.log(`Administrador: ${EMAIL_ADMIN} / ${SENHA}`);
    console.log(`Usuário: ${EMAIL_USUARIO} / ${SENHA}`);
    return;
  }

  const hash = hashPassword(SENHA);
  await atomic([
    {
      sql: 'INSERT INTO households (name, invite_code) VALUES (?, ?)',
      args: ['Casa Demo', CODIGO],
    },
    {
      sql: 'INSERT INTO users (household_id, name, email, password_hash, role) SELECT id, ?, ?, ?, ? FROM households WHERE invite_code = ?',
      args: ['Administrador Demo', EMAIL_ADMIN, hash, 'RESPONSAVEL', CODIGO],
    },
    {
      sql: 'INSERT INTO users (household_id, name, email, password_hash, role) SELECT id, ?, ?, ?, ? FROM households WHERE invite_code = ?',
      args: ['Usuário Demo', EMAIL_USUARIO, hash, 'ADOLESCENTE', CODIGO],
    },
    {
      sql: 'INSERT INTO tasks (household_id, title, xp, assignee_id, description) SELECT h.id, ?, ?, u.id, ? FROM households h JOIN users u ON u.email = ? WHERE h.invite_code = ?',
      args: ['Arrumar a cama', 10, 'Deixar o lençol esticado e o travesseiro no lugar.', EMAIL_USUARIO, CODIGO],
    },
    {
      sql: 'INSERT INTO rewards (household_id, title, cost) SELECT id, ?, ? FROM households WHERE invite_code = ?',
      args: ['Escolher o filme da noite', 30, CODIGO],
    },
  ]);

  console.log('Contas de demonstração criadas.');
  console.log(`Administrador: ${EMAIL_ADMIN} / ${SENHA}`);
  console.log(`Usuário: ${EMAIL_USUARIO} / ${SENHA}`);
  console.log(`Código de convite da casa: ${CODIGO}`);
}

main()
  .catch((err) => {
    console.error('Falha ao criar as contas de demonstração:', err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
