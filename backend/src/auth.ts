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
  try {
    const [salt, hash] = stored.split(':');

    if (!salt || !hash || !/^[a-f0-9]+$/i.test(hash) || hash.length % 2 !== 0) {
      return false;
    }

    const expected = Buffer.from(hash, 'hex');

    if (expected.length !== 64) return false;

    const actual = crypto.scryptSync(password, salt, expected.length);

    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');

  await run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+7 days'))`,
    [token, userId],
  );

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
        WHERE s.token = ?
          AND s.expires_at > CURRENT_TIMESTAMP`,
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
