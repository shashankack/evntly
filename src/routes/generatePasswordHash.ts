// src/routes/generatePasswordHash.ts
import { Hono } from 'hono';
import { hash } from 'bcryptjs';

const app = new Hono();

// POST /generate-password-hash { password: string }
app.get('/generate-password-hash', async (c) => {
  const password = c.req.query('password');
  if (!password || typeof password !== 'string' || password.length < 6) {
    return c.json({ error: 'Password must be at least 6 characters.' }, 400);
  }
  const passwordHash = await hash(password, 10);
  return c.json({ passwordHash });
});

export default app;
