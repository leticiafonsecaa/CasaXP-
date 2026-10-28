import fs from 'node:fs';
import path from 'node:path';
import { createClient, type InStatement } from '@libsql/client';

// Em produção: TURSO_URL e TURSO_AUTH_TOKEN apontam para o banco no Turso.
// Sem essas variáveis, usa um arquivo local (DB_PATH ou backend/data/casaxp.db).
function configurarConexao(): { url: string; authToken?: string } {
  if (process.env.TURSO_URL) {
    return { url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  const arquivo = process.env.DB_PATH ?? path.resolve(__dirname, '../data/casaxp.db');
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  return { url: 'file:' + arquivo.replace(/\\/g, '/') };
}

export const db = createClient(configurarConexao());

/** Transforma o resultado do banco em objetos simples, com o nome das colunas. */
function linhasComoObjetos(resultado: { columns: string[]; rows: any[] }): any[] {
  return resultado.rows.map((linha) =>
    Object.fromEntries(resultado.columns.map((coluna, i) => [coluna, linha[i]])),
  );
}

type Args = any[];

/** Lista de linhas de uma consulta. */
export async function all<T = any>(sql: string, args: Args = []): Promise<T[]> {
  const resultado = await db.execute({ sql, args });
  return linhasComoObjetos(resultado) as T[];
}

/** Primeira linha de uma consulta (ou undefined). */
export async function get<T = any>(sql: string, args: Args = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

/** Executa uma alteração (INSERT, UPDATE, DELETE). */
export async function run(sql: string, args: Args = []): Promise<{ lastInsertRowid: number }> {
  const resultado = await db.execute({ sql, args });
  return { lastInsertRowid: Number(resultado.lastInsertRowid ?? 0) };
}

/** Executa várias alterações como uma só: ou todas são aplicadas, ou nenhuma. */
export async function atomic(instrucoes: InStatement[]): Promise<void> {
  await db.batch(instrucoes, 'write');
}

async function garantirColuna(tabela: string, coluna: string, tipo: string): Promise<void> {
  const colunas = await all<{ name: string }>(`PRAGMA table_info(${tabela})`);
  if (!colunas.some((c) => c.name === coluna)) {
    await db.execute(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  }
}

/** Cria as tabelas e acrescenta colunas novas em bancos antigos, sem apagar dados. */
export async function iniciarBanco(): Promise<void> {
  await db.executeMultiple(`
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

  await garantirColuna('tasks', 'description', 'TEXT');
  await garantirColuna('tasks', 'approved_on', 'TEXT');
  await garantirColuna('activities', 'description', 'TEXT');
}
