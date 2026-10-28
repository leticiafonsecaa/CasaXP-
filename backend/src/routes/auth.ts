import crypto from 'node:crypto';
import { Router } from 'express';
import { createSession, hashPassword, requireAuth, verifyPassword } from '../auth';
import { db, tx } from '../db';
import { validateEmail, validatePassword, type Role } from '../rules';

export const authRouter = Router();

interface UserRow {
  id: number;
  household_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  xp: number;
}

function publicUser(u: UserRow) {
  return { id: u.id, householdId: u.household_id, name: u.name, email: u.email, role: u.role, xp: u.xp };
}

/** Código de convite curto, sem caracteres confusos (0, O, 1, I). */
function gerarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (const byte of crypto.randomBytes(6)) code += chars[byte % chars.length];
  return code;
}

/** Cria conta. Administrador cria uma casa nova; usuário entra com o código de convite. */
authRouter.post('/signup', (req, res) => {
  const { name, email, password, role, inviteCode } = req.body ?? {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Informe seu nome' });
  }
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (role !== 'RESPONSAVEL' && role !== 'ADOLESCENTE') {
    return res.status(400).json({ error: 'Escolha se é Administrador ou Usuário' });
  }

  const emailNormalizado = (email as string).trim().toLowerCase();
  const jaExiste = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNormalizado);
  if (jaExiste) return res.status(409).json({ error: 'Este e-mail já está cadastrado' });

  let householdId: number;
  if (role === 'RESPONSAVEL') {
    householdId = tx(() => {
      const info = db
        .prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)')
        .run(`Casa de ${name.trim()}`, gerarCodigo());
      return Number(info.lastInsertRowid);
    });
  } else {
    const codigo = typeof inviteCode === 'string' ? inviteCode.trim().toUpperCase() : '';
    const casa = db.prepare('SELECT id FROM households WHERE invite_code = ?').get(codigo) as
      | { id: number }
      | undefined;
    if (!casa) return res.status(400).json({ error: 'Código de convite inválido' });
    householdId = casa.id;
  }

  const info = db
    .prepare('INSERT INTO users (household_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(householdId, name.trim(), emailNormalizado, hashPassword(password as string), role);

  const token = createSession(Number(info.lastInsertRowid));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid)) as unknown as UserRow;
  res.status(201).json({ token, user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNormalizado) as unknown as
    | UserRow
    | undefined;
  // Mensagem genérica: não revela se o e-mail existe.
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const row = db.prepare('SELECT xp FROM users WHERE id = ?').get(req.user!.id) as { xp: number };
  res.json({ user: { ...req.user!, xp: row.xp } });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  const header = req.headers.authorization ?? '';
  db.prepare('DELETE FROM sessions WHERE token = ?').run(header.slice(7));
  res.json({ ok: true });
});
