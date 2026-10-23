import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx } from '../db';
import { createSession, hashPassword, verifyPassword, requireAuth } from '../auth';
import { validateEmail, validatePassword, type Role } from '../rules';

export const authRouter = Router();

function newInviteCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Cadastro:
 * - RESPONSAVEL cria uma casa nova (householdName) e recebe o código de convite.
 * - ADOLESCENTE entra numa casa existente usando o inviteCode.
 */
authRouter.post('/signup', (req, res) => {
  const { name, email, password, role, householdName, inviteCode } = req.body ?? {};

  if (typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Informe seu nome' });
  }
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (role !== 'RESPONSAVEL' && role !== 'ADOLESCENTE') {
    return res.status(400).json({ error: 'Papel inválido' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'E-mail já cadastrado' });

  try {
    const result = tx(() => {
      let householdId: number;
      let code: string;

      if (role === 'RESPONSAVEL') {
        if (typeof householdName !== 'string' || householdName.trim().length < 2) {
          throw new HttpError(400, 'Informe o nome da casa');
        }
        code = newInviteCode();
        const info = db
          .prepare('INSERT INTO households (name, invite_code) VALUES (?, ?)')
          .run(householdName.trim(), code);
        householdId = Number(info.lastInsertRowid);
      } else {
        const house = db
          .prepare('SELECT id, invite_code FROM households WHERE invite_code = ?')
          .get(String(inviteCode ?? '').trim().toUpperCase()) as
          | { id: number; invite_code: string }
          | undefined;
        if (!house) throw new HttpError(400, 'Código de convite inválido');
        householdId = house.id;
        code = house.invite_code;
      }

      const userInfo = db
        .prepare(
          'INSERT INTO users (household_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        )
        .run(householdId, name.trim(), email.toLowerCase(), hashPassword(password), role as Role);
      const userId = Number(userInfo.lastInsertRowid);
      return { userId, code };
    });

    const token = createSession(result.userId);
    res.status(201).json({ token, inviteCode: role === 'RESPONSAVEL' ? result.code : undefined });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe e-mail e senha' });
  }
  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .get(email.toLowerCase()) as { id: number; password_hash: string } | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }
  res.json({ token: createSession(user.id) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
