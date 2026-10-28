import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { get, run } from './db';
import type { Role } from './rules';

export interface AuthUser {
  id: number;
  householdId: number;
  name: string;
  email: string;
  role: Role;
  xp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, user_id) VALUES (?, ?)', [token, userId]);
  return token;
}

/** Descobre o usuário pelo token. Nunca confia em IDs enviados pelo cliente. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    const row = await get<AuthUser>(
      `SELECT u.id, u.household_id AS householdId, u.name, u.email, u.role, u.xp
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
      [token],
    );
    if (!row) {
      res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
      return;
    }
    req.user = row;
    next();
  } catch (err) {
    next(err);
  }
}
