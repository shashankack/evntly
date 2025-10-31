// src/middleware/jwtAuth.ts
import { verify } from 'hono/jwt';
import type { MiddlewareHandler } from 'hono';

export const jwtAuth: MiddlewareHandler = async (c, next) => {
  const auth = c.req.header('authorization');
  const wantsHtml = c.req.header('accept')?.includes('text/html');
  if (!auth || !auth.startsWith('Bearer ')) {
    if (wantsHtml) {
      return c.redirect('/organizer/login-page', 302);
    }
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }
  const token = auth.replace('Bearer ', '');
  const secret = process.env.JWT_SECRET || 'changeme';
  try {
    const payload = await verify(token, secret);
    c.set('jwtPayload', payload);
    await next();
  } catch (e) {
    if (wantsHtml) {
      return c.redirect('/organizer/login-page', 302);
    }
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
};
