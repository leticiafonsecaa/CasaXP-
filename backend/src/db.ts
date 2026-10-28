import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

// Em produção, DB_PATH aponta para um disco persistente.
// Nos testes, DB_PATH=':memory:'.
const dbPath = process.env.DB_PATH ?? path.resolve(__dirname, '../data/casaxp.db');
if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id  INTEGER NOT NULL REFERENCES households(id),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('RESPONSAVEL','ADOLESCENTE')),
  xp            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id),
  title        TEXT NOT NULL,
  xp           INTEGER NOT NULL,
  assignee_id  INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'PENDENTE'
               CHECK (status IN ('PENDENTE','AGUARDANDO_APROVACAO','APROVADA')),
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id),
  title        TEXT NOT NULL,
  cost         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id  INTEGER NOT NULL REFERENCES rewards(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activities (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  household_id INTEGER NOT NULL REFERENCES households(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  actor_id     INTEGER NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('TAREFA_CONCLUIDA','RECOMPENSA_RESGATADA','NOVA_TAREFA')),
  title        TEXT NOT NULL,
  amount       INTEGER NOT NULL,
  read         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

// Bancos criados antes desta versão não têm a coluna "description": adiciona sem apagar dados.
const colunasTarefas = db.prepare('PRAGMA table_info(tasks)').all() as unknown as { name: string }[];
if (!colunasTarefas.some((c) => c.name === 'description')) {
  db.exec('ALTER TABLE tasks ADD COLUMN description TEXT');
}

const colunasAtividades = db.prepare('PRAGMA table_info(activities)').all() as unknown as { name: string }[];
if (!colunasAtividades.some((c) => c.name === 'description')) {
  db.exec('ALTER TABLE activities ADD COLUMN description TEXT');
}

const colunasTarefas2 = db.prepare('PRAGMA table_info(tasks)').all() as unknown as { name: string }[];
if (!colunasTarefas2.some((c) => c.name === 'approved_on')) {
  db.exec('ALTER TABLE tasks ADD COLUMN approved_on TEXT');
}

/** Executa uma função dentro de uma transação (node:sqlite é síncrono). */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
