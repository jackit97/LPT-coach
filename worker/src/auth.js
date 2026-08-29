import { sign, verify } from 'hono/jwt';

const EXPIRES_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function signToken(payload, secret) {
  const exp = Math.floor(Date.now() / 1000) + EXPIRES_SECONDS;
  return sign({ ...payload, exp }, secret);
}

export async function verifyToken(token, secret) {
  return verify(token, secret, 'HS256');
}

// Hono middleware: requires a valid Bearer token, sets c.set('user', payload)
export function authenticate() {
  return async (c, next) => {
    const header = c.req.header('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return c.json({ message: 'Token richiesto' }, 401);
    try {
      const payload = await verifyToken(token, c.env.JWT_SECRET || 'dev-secret');
      c.set('user', payload);
      await next();
    } catch (e) {
      return c.json({ message: 'Token non valido o scaduto' }, 401);
    }
  };
}

// Hono middleware factory: requires the authenticated user to have one of the given roles
export function roleCheck(...roles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.ruolo)) {
      return c.json({ message: 'Accesso negato' }, 403);
    }
    await next();
  };
}
