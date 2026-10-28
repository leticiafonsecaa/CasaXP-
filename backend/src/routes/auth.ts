import crypto from 'node:crypto';
import { Router } from 'express';
import { createSession, hashPassword, requireAuth, verifyPassword } from '../auth';
import { atomic, get, run } from '../db';
import { ah } from '../http';
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
  return { id: Number(u.id), householdId: Number(u.household_id), name: u.name, email: u.email, role: u.role, xp: Number(u.xp) };
}

/** Código de convite curto, sem caracteres confusos (0, O, 1, I). */
function gerarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (const byte of crypto.randomBytes(6)) code += chars[byte % chars.length];
  return code;
}

/** Cria conta. Administrador cria uma casa nova; usuário entra com o código de convite. */
authRouter.post('/signup', ah(async (req, res) => {
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
  const jaExiste = await get('SELECT id FROM users WHERE email = ?', [emailNormalizado]);
  if (jaExiste) return res.status(409).json({ error: 'Este e-mail já está cadastrado' });

  const senhaHash = hashPassword(password as string);

  if (role === 'RESPONSAVEL') {
    // Casa e administrador são criados juntos: ou os dois, ou nenhum.
    const codigo = gerarCodigo();
    await atomic([
      { sql: 'INSERT INTO households (name, invite_code) VALUES (?, ?)', args: [`Casa de ${name.trim()}`, codigo] },
      {
        sql: 'INSERT INTO users (household_id, name, email, password_hash, role) SELECT id, ?, ?, ?, ? FROM households WHERE invite_code = ?',
        args: [name.trim(), emailNormalizado, senhaHash, role, codigo],
      },
    ]);
  } else {
    const codigo = typeof inviteCode === 'string' ? inviteCode.trim().toUpperCase() : '';
    const casa = await get<{ id: number }>('SELECT id FROM households WHERE invite_code = ?', [codigo]);
    if (!casa) return res.status(400).json({ error: 'Código de convite inválido' });
    await run(
      'INSERT INTO users (household_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [casa.id, name.trim(), emailNormalizado, senhaHash, role],
    );
  }

  const user = await get<UserRow>('SELECT * FROM users WHERE email = ?', [emailNormalizado]);
  const token = await createSession(Number(user!.id));
  res.status(201).json({ token, user: publicUser(user!) });
}));

authRouter.post('/login', ah(async (req, res) => {
  const { email, password } = req.body ?? {};
  const emailNormalizado = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const user = await get<UserRow>('SELECT * FROM users WHERE email = ?', [emailNormalizado]);
  // Mensagem genérica: não revela se o e-mail existe.
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }
  const token = await createSession(Number(user.id));
  res.json({ token, user: publicUser(user) });
}));

authRouter.get('/me', requireAuth, ah(async (req, res) => {
  const row = await get<{ xp: number }>('SELECT xp FROM users WHERE id = ?', [req.user!.id]);
  res.json({ user: { ...req.user!, xp: Number(row!.xp) } });
}));

authRouter.post('/logout', requireAuth, ah(async (req, res) => {
  const header = req.headers.authorization ?? '';
  await run('DELETE FROM sessions WHERE token = ?', [header.slice(7)]);
  res.json({ ok: true });
}));
